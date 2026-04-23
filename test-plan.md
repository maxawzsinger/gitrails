# GitRails E2E Test Plan

## Goal

One file (`test/e2e.test.ts`) that exercises every HTTP route the app exposes, against the real GitHub API through the real Express app, and proves that every `/execute` proxied action has the intended effect on GitHub.

## Stack

- `node:test` + `supertest` against the imported `app` from `src/app.ts` (no `listen`).
- Real GitHub App creds. No mocks.
- Fresh temp SQLite per run (temp path set into `DATABASE_PATH` **before** importing `app`/`db`).

## Prerequisites (human, once)

1. GitHub App with repo read/write (contents, PRs, issues). Creds in env.
2. App installed on a throwaway `TEST_OWNER` (account) with access granted to `TEST_REPO` (single repo under that account).
3. Default branch (`TEST_BASE_BRANCH`) has at least one commit.

## Env (top of test file, throw if missing)

All `src/config.ts` vars plus: `TEST_OWNER`, `TEST_REPO`, `TEST_BASE_BRANCH`, `TEST_INSTALLATION_ID`.

## Shared helpers (inline)

- `exec(key, body)` → `POST /execute`.
- `asPrincipal(path, init)` / `asAgent(path, init)` → authed wrappers.
- `runId = crypto.randomBytes(4).toString("hex")` for unique branch/file/issue names.

---

## Part 1 — HTTP route coverage

One subtest per route. Setup steps (callback, create agent key, set permissions) double as positive tests for those routes; the rest are explicit subtests.

### `GET /githubTargets/github-app-callback`

Call with `?installation_id=TEST_INSTALLATION_ID`. Assert `200`, body contains `pk_...`. Regex-extract it → `PRINCIPAL_KEY`. Also functions as principal-key seed.

### `POST /agentKeys`

Create `{ prefix: "e2e" }` with `PRINCIPAL_KEY` → capture `AGENT_KEY`, `AGENT_KEY_ID`. Assert `200`, prefix echoed.

### `GET /agentKeys`

Assert returned list contains `AGENT_KEY_ID`.

### `PUT /agentKeys/:id/permissions`

Set all 21 actions to `{}`. Assert `200`.

### `GET /agentKeys/current`

With `AGENT_KEY`, assert `id === AGENT_KEY_ID` and permissions reflect the PUT.

### `GET /requests`

Before any `/execute`, assert empty. After Part 2, assert count equals number of successful `/execute` calls.

### `GET /requests/all`

Same count as `/requests` (single agent).

### `DELETE /agentKeys/:id`

Run **last**. Create a second throwaway agent key, delete it, assert `GET /agentKeys` no longer contains it, and that calls with that deleted key return `401`.

### `POST /execute`

Covered exhaustively in Parts 2 and 3.

### Auth negatives

- Missing `Authorization` on any authed route → `401`.
- Agent key on a principal-only route → `403`.
- Principal key on `/execute` → `403`.

---

## Part 2 — `/execute` proxied actions with effect verification

All 21 actions, serialized in dependency order. Every call asserts `200` + a minimal shape check. **Every mutation is followed by an independent read that proves the effect landed on GitHub.** Reads are self-verifying.

Setup: fork two branches from `TEST_BASE_BRANCH` via direct Octokit `git.createRef` (ref creation is not a proxied action): `HEAD = gitrails-e2e-<runId>-head` (PR source) and `BASE = gitrails-e2e-<runId>-base` (PR target). All subsequent mutations target `HEAD` and `BASE`.

Steps:

1. **`repos.get`** — shape only.
2. **`git.getRef heads/HEAD`** — capture `headSha`.
3. **`repos.createOrUpdateFileContents`** — path=`gitrails-e2e/<runId>.txt`, branch=`HEAD`, content="v1".
4. **`repos.getContent`** (same path, ref=`HEAD`) — *verify:* decoded content === "v1"; capture `fileBlobSha`, `fileCommitSha`, `fileTreeSha`.
5. **`git.createBlob`** — content="hello".
6. **`git.getBlob`** — *verify:* sha matches, content round-trips.
7. **`git.createTree`** — `base_tree=fileTreeSha`, one entry with blob from step 5.
8. **`git.getTree`** — *verify:* contains entry from step 7.
9. **`git.createCommit`** — tree from step 7, `parents=[fileCommitSha]`.
10. **`git.getCommit`** — *verify:* tree sha + parent sha match step 9 inputs.
11. **`git.updateRef`** — `HEAD` → commit from step 9. *Verify via a second `git.getRef`:* returned sha equals commit from step 9.
12. **`pulls.create`** — head=`HEAD`, base=`BASE`.
13. **`pulls.get`** — *verify:* state=open, head.ref=`HEAD`, base.ref=`BASE`; capture `pullNumber`.
14. **`pulls.list`** (state=open) — *verify:* contains `pullNumber`.
15. **`pulls.listCommits`** — *verify:* contains commit from step 9.
16. **`pulls.listFiles`** — *verify:* contains the new file path.
17. **`pulls.update`** — new title. *Verify via a second `pulls.get`:* title changed.
18. **`pulls.merge`** (squash) — *verify via a third `pulls.get`:* `merged=true`, `state=closed`.
19. **`repos.deleteFile`** — the file, branch=`BASE`, sha from step 4. *Verify via a second `repos.getContent`:* upstream returns `404` (proxy surfaces as `/execute` `404`).
20. **`issues.create`** — capture `issueNumber`.
21. **`issues.list`** (state=open) — *verify:* contains `issueNumber`.

Teardown (direct Octokit): close issue, delete `HEAD` and `BASE`, `rm -rf` temp DB.

---

## Part 3 — `/execute` cross-cutting behavior

Independent subtests using freshly minted agent keys with scoped permissions.

1. **Unknown action** — `{ actionName: "github.nope" }` → `400`.
2. **Schema failure** — `github.repos.get` missing `repo` → `400` with `details`.
3. **Action not in perms** — agent key with `{}` → `403`.
4. **Regex mismatch (required param)** — `{ "github.repos.get": { owner: "^otherorg$" } }`, call with `TEST_OWNER` → `403`.
5. **Regex fail-closed on omitted optional** — `{ "github.repos.getContent": { ref: "^main$" } }`, call omits `ref` → `403`.
6. **Request log on success** — row exists; decrypted payload equals request body.
7. **No request log on permission denial** — row count unchanged after denial.

---

## Non-goals

- Parallelization. Serial keeps fixture chaining trivial.
- Per-action GitHub-error paths (404/422/etc.); one happy path per action.
- Re-testing authed routes across both key types once one negative case per route is covered.
