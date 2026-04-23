import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import request from "supertest";

// -----------------------------------------------------------------------------
// Env setup. Throw early if required vars are missing.
// -----------------------------------------------------------------------------

const ROOT_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
loadEnv({ path: path.join(ROOT_DIR, ".env") });
loadEnv({ path: path.join(ROOT_DIR, ".test.env"), override: true });

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

for (const key of [
  "GITHUB_APP_ID",
  "GITHUB_APP_PRIVATE_KEY",
  "ENCRYPTION_KEY",
  "ENCRYPTION_SALT",
  "PORT",
] as const) {
  required(key);
}

const E2E_OWNER = required("E2E_OWNER");
const E2E_REPO = required("E2E_REPO");
const E2E_BASE_BRANCH = required("E2E_BASE_BRANCH");
const E2E_INSTALLATION_ID = Number.parseInt(
  required("E2E_INSTALLATION_ID"),
  10,
);
if (!Number.isSafeInteger(E2E_INSTALLATION_ID) || E2E_INSTALLATION_ID <= 0) {
  throw new Error("E2E_INSTALLATION_ID must be a positive integer.");
}

// Point DATABASE_PATH at a fresh temp file before src/db.ts initializes.
const TEMP_DB_PATH = path.join(
  os.tmpdir(),
  `gitrails-e2e-${crypto.randomBytes(4).toString("hex")}.sqlite`,
);
process.env.DATABASE_PATH = TEMP_DB_PATH;

const { app: expressApp } = await import("../src/app.js");
const { db } = await import("../src/db.js");
const { app: githubAppClient } = await import("../src/lib/octokit.js");
const { decrypt } = await import("../src/lib/encryption.js");

const installationOctokit =
  await githubAppClient.getInstallationOctokit(E2E_INSTALLATION_ID);

// -----------------------------------------------------------------------------
// Shared helpers.
// -----------------------------------------------------------------------------

function log(message: string): void {
  const ts = new Date().toISOString().slice(11, 23);
  process.stderr.write(`[e2e ${ts}] ${message}\n`);
}

type StepCtx = { test: (name: string, fn: () => Promise<void>) => Promise<void> };

async function step(
  t: StepCtx,
  name: string,
  fn: () => Promise<void>,
): Promise<void> {
  await t.test(name, async () => {
    log(`STEP > ${name}`);
    const started = Date.now();
    try {
      await fn();
      log(`STEP ok ${name} (${Date.now() - started}ms)`);
    } catch (err) {
      log(
        `STEP FAIL ${name} (${Date.now() - started}ms): ${err instanceof Error ? err.message : String(err)}`,
      );
      throw err;
    }
  });
}

const runId = crypto.randomBytes(4).toString("hex");
const HEAD_BRANCH = `gitrails-e2e-${runId}-head`;
const BASE_BRANCH = `gitrails-e2e-${runId}-base`;
const FILE_PATH = `gitrails-e2e/${runId}.txt`;
const EXTRA_FILE_PATH = `gitrails-e2e/${runId}-extra.txt`;
const ISSUE_TITLE = `gitrails e2e issue ${runId}`;

type ExecBody = Record<string, unknown> & { actionName: string };
type SupertestResponse = Awaited<
  ReturnType<ReturnType<typeof request>["get"]>
>;

function bearer(key: string) {
  const authorize = <T extends { set: (name: string, value: string) => T }>(
    req: T,
  ) => req.set("Authorization", `Bearer ${key}`);
  return {
    get: (p: string) => authorize(request(expressApp).get(p)),
    post: (p: string) => authorize(request(expressApp).post(p)),
    put: (p: string) => authorize(request(expressApp).put(p)),
    delete: (p: string) => authorize(request(expressApp).delete(p)),
  };
}

let principalExecSuccess = 0;
// Tracks per-agent-key /execute 200 responses so /requests totals can be
// asserted precisely. Primary agent key is added once it is created.
const agentExecSuccess = new Map<string, number>();

async function exec(
  agentKey: string,
  body: ExecBody,
): Promise<SupertestResponse> {
  log(`exec -> ${body.actionName}`);
  const res = await request(expressApp)
    .post("/execute")
    .set("Authorization", `Bearer ${agentKey}`)
    .send(body);
  log(`exec <- ${body.actionName} status=${res.status}`);
  if (res.status === 200) {
    principalExecSuccess += 1;
    agentExecSuccess.set(agentKey, (agentExecSuccess.get(agentKey) ?? 0) + 1);
  }
  return res;
}

function decodeBase64Utf8(value: string): string {
  return Buffer.from(value.replace(/\n/g, ""), "base64").toString("utf8");
}

// Every declared action in the endpoint registry. Kept inline to avoid
// importing registry internals from the test file.
const ALL_ACTION_NAMES = [
  "github.repos.get",
  "github.repos.getContent",
  "github.git.getRef",
  "github.git.getCommit",
  "github.git.getTree",
  "github.git.getBlob",
  "github.repos.createOrUpdateFileContents",
  "github.repos.deleteFile",
  "github.git.createBlob",
  "github.git.createTree",
  "github.git.createCommit",
  "github.git.updateRef",
  "github.pulls.create",
  "github.pulls.list",
  "github.pulls.get",
  "github.pulls.update",
  "github.pulls.merge",
  "github.pulls.listFiles",
  "github.pulls.listCommits",
  "github.issues.create",
  "github.issues.list",
] as const;

function buildFullPermissions(): Record<string, Record<string, string>> {
  const perms: Record<string, Record<string, string>> = {};
  for (const name of ALL_ACTION_NAMES) {
    perms[name] = {
      owner: `^${E2E_OWNER}$`,
      repo: `^${E2E_REPO}$`,
    };
  }
  return perms;
}

async function deleteRefIfExists(ref: string): Promise<void> {
  log(`octokit -> DELETE ref ${ref}`);
  try {
    await installationOctokit.request(
      "DELETE /repos/{owner}/{repo}/git/refs/{ref}",
      { owner: E2E_OWNER, repo: E2E_REPO, ref },
    );
    log(`octokit <- DELETE ref ${ref} ok`);
  } catch (error: unknown) {
    const status =
      error && typeof error === "object" && "status" in error
        ? (error as { status: number }).status
        : 0;
    log(`octokit <- DELETE ref ${ref} status=${status}`);
    if (status !== 404 && status !== 422) {
      throw error;
    }
  }
}

// -----------------------------------------------------------------------------
// The test.
// -----------------------------------------------------------------------------

test(
  "GitRails end-to-end",
  { timeout: 5 * 60_000 },
  async (t) => {
    log(`setup: runId=${runId} HEAD=${HEAD_BRANCH} BASE=${BASE_BRANCH}`);
    log(`octokit -> getRef heads/${E2E_BASE_BRANCH}`);
    const baseRef = await installationOctokit.rest.git.getRef({
      owner: E2E_OWNER,
      repo: E2E_REPO,
      ref: `heads/${E2E_BASE_BRANCH}`,
    });
    const baseBranchSha = baseRef.data.object.sha;
    log(`octokit <- getRef sha=${baseBranchSha}`);

    await deleteRefIfExists(`heads/${HEAD_BRANCH}`);
    await deleteRefIfExists(`heads/${BASE_BRANCH}`);

    log(`octokit -> createRef refs/heads/${HEAD_BRANCH}`);
    await installationOctokit.rest.git.createRef({
      owner: E2E_OWNER,
      repo: E2E_REPO,
      ref: `refs/heads/${HEAD_BRANCH}`,
      sha: baseBranchSha,
    });
    log(`octokit <- createRef refs/heads/${HEAD_BRANCH}`);
    log(`octokit -> createRef refs/heads/${BASE_BRANCH}`);
    await installationOctokit.rest.git.createRef({
      owner: E2E_OWNER,
      repo: E2E_REPO,
      ref: `refs/heads/${BASE_BRANCH}`,
      sha: baseBranchSha,
    });
    log(`octokit <- createRef refs/heads/${BASE_BRANCH}`);

    // State shared between subtests.
    let principalKey = "";
    let primaryAgentKey = "";
    let primaryAgentKeyId = "";
    let pullNumber = 0;
    let issueNumber = 0;
    let headSha = "";
    let fileBlobSha = "";
    let fileCommitSha = "";
    let fileTreeSha = "";
    let createdBlobSha = "";
    let createdTreeSha = "";
    let createdCommitSha = "";

    try {
      // -----------------------------------------------------------------------
      // Part 1 — HTTP route coverage (interleaves with Part 2 for chaining).
      // -----------------------------------------------------------------------

      await step(t, "GET /githubTargets/github-app-callback", async () => {
        const res = await request(expressApp).get(
          `/githubTargets/github-app-callback?installation_id=${E2E_INSTALLATION_ID}`,
        );
        assert.equal(res.status, 200);
        const match = res.text.match(/pk_[a-f0-9]{64}/);
        assert(match, `Expected principal key in callback HTML: ${res.text}`);
        principalKey = match[0];
      });

      await step(t, "POST /agentKeys", async () => {
        const res = await bearer(principalKey)
          .post("/agentKeys")
          .send({ prefix: "e2e" });
        assert.equal(res.status, 200);
        assert.equal(res.body.prefix, "e2e");
        assert.ok(typeof res.body.id === "string");
        assert.ok(typeof res.body.key === "string");
        primaryAgentKey = res.body.key;
        primaryAgentKeyId = res.body.id;
        agentExecSuccess.set(primaryAgentKey, 0);
      });

      await step(t, "GET /agentKeys", async () => {
        const res = await bearer(principalKey).get("/agentKeys");
        assert.equal(res.status, 200);
        const ids = (res.body as Array<{ id: string }>).map((r) => r.id);
        assert.ok(ids.includes(primaryAgentKeyId));
      });

      await step(t, "PUT /agentKeys/:id/permissions (set all 21 to {})", async () => {
        const permissions: Record<string, Record<string, string>> = {};
        for (const name of ALL_ACTION_NAMES) {
          permissions[name] = {};
        }
        const res = await bearer(principalKey)
          .put(`/agentKeys/${primaryAgentKeyId}/permissions`)
          .send({ permissions });
        assert.equal(res.status, 200);
        assert.equal(res.body.ok, true);
      });

      await step(t, "GET /agentKeys/current", async () => {
        const res = await bearer(primaryAgentKey).get("/agentKeys/current");
        assert.equal(res.status, 200);
        assert.equal(res.body.id, primaryAgentKeyId);
        const permissions = res.body.permissions as Record<string, unknown>;
        assert.equal(
          Object.keys(permissions).length,
          ALL_ACTION_NAMES.length,
        );
        for (const name of ALL_ACTION_NAMES) {
          assert.deepEqual(permissions[name], {});
        }
      });

      await step(t, "GET /requests — empty before /execute", async () => {
        const res = await bearer(primaryAgentKey).get("/requests");
        assert.equal(res.status, 200);
        assert.equal(res.body.total, 0);
        assert.deepEqual(res.body.requests, []);
      });

      await step(t, "auth: missing Authorization on /requests → 401", async () => {
        const res = await request(expressApp).get("/requests");
        assert.equal(res.status, 401);
      });

      await step(t, "auth: agent key on /agentKeys (principal-only) → 403", async () => {
        const res = await bearer(primaryAgentKey).get("/agentKeys");
        assert.equal(res.status, 403);
      });

      await step(t, "auth: principal key on /execute → 403", async () => {
        const res = await bearer(principalKey)
          .post("/execute")
          .send({
            actionName: "github.repos.get",
            owner: E2E_OWNER,
            repo: E2E_REPO,
          });
        assert.equal(res.status, 403);
      });

      // Broaden the primary key's permissions so Part 2 can drive real actions.
      await step(t, "PUT /agentKeys/:id/permissions (full allow)", async () => {
        const res = await bearer(principalKey)
          .put(`/agentKeys/${primaryAgentKeyId}/permissions`)
          .send({ permissions: buildFullPermissions() });
        assert.equal(res.status, 200);
        assert.equal(res.body.ok, true);
      });

      // -----------------------------------------------------------------------
      // Part 2 — /execute proxied actions with effect verification.
      // -----------------------------------------------------------------------

      await step(t, "Part 2 step 1: repos.get", async () => {
        const res = await exec(primaryAgentKey, {
          actionName: "github.repos.get",
          owner: E2E_OWNER,
          repo: E2E_REPO,
        });
        assert.equal(res.status, 200);
        assert.equal(
          res.body.data.full_name,
          `${E2E_OWNER}/${E2E_REPO}`,
        );
      });

      await step(t, "Part 2 step 2: git.getRef heads/HEAD", async () => {
        const res = await exec(primaryAgentKey, {
          actionName: "github.git.getRef",
          owner: E2E_OWNER,
          repo: E2E_REPO,
          ref: `heads/${HEAD_BRANCH}`,
        });
        assert.equal(res.status, 200);
        assert.equal(res.body.data.ref, `refs/heads/${HEAD_BRANCH}`);
        headSha = res.body.data.object.sha;
        assert.equal(headSha, baseBranchSha);
      });

      await step(t, 
        "Part 2 step 3: repos.createOrUpdateFileContents",
        async () => {
          const res = await exec(primaryAgentKey, {
            actionName: "github.repos.createOrUpdateFileContents",
            owner: E2E_OWNER,
            repo: E2E_REPO,
            path: FILE_PATH,
            branch: HEAD_BRANCH,
            message: `create ${FILE_PATH}`,
            content: "v1",
          });
          assert.equal(res.status, 200);
          assert.equal(res.body.data.content.path, FILE_PATH);
          fileBlobSha = res.body.data.content.sha;
          fileCommitSha = res.body.data.commit.sha;
          fileTreeSha = res.body.data.commit.tree.sha;
        },
      );

      await step(t, "Part 2 step 4: repos.getContent verifies v1", async () => {
        const res = await exec(primaryAgentKey, {
          actionName: "github.repos.getContent",
          owner: E2E_OWNER,
          repo: E2E_REPO,
          path: FILE_PATH,
          ref: HEAD_BRANCH,
        });
        assert.equal(res.status, 200);
        assert.equal(res.body.data.path, FILE_PATH);
        assert.equal(res.body.data.sha, fileBlobSha);
        assert.equal(decodeBase64Utf8(res.body.data.content), "v1");
      });

      await step(t, "Part 2 step 5: git.createBlob", async () => {
        const res = await exec(primaryAgentKey, {
          actionName: "github.git.createBlob",
          owner: E2E_OWNER,
          repo: E2E_REPO,
          content: "hello",
          encoding: "utf-8",
        });
        assert.equal(res.status, 200);
        createdBlobSha = res.body.data.sha;
        assert.ok(createdBlobSha);
      });

      await step(t, "Part 2 step 6: git.getBlob round-trip", async () => {
        const res = await exec(primaryAgentKey, {
          actionName: "github.git.getBlob",
          owner: E2E_OWNER,
          repo: E2E_REPO,
          file_sha: createdBlobSha,
        });
        assert.equal(res.status, 200);
        assert.equal(res.body.data.sha, createdBlobSha);
        assert.equal(decodeBase64Utf8(res.body.data.content), "hello");
      });

      await step(t, "Part 2 step 7: git.createTree", async () => {
        const res = await exec(primaryAgentKey, {
          actionName: "github.git.createTree",
          owner: E2E_OWNER,
          repo: E2E_REPO,
          base_tree: fileTreeSha,
          stringifiedTree: JSON.stringify([
            {
              path: EXTRA_FILE_PATH,
              mode: "100644",
              type: "blob",
              sha: createdBlobSha,
            },
          ]),
        });
        assert.equal(res.status, 200);
        createdTreeSha = res.body.data.sha;
        assert.ok(createdTreeSha);
      });

      await step(t, "Part 2 step 8: git.getTree contains new entry", async () => {
        const res = await exec(primaryAgentKey, {
          actionName: "github.git.getTree",
          owner: E2E_OWNER,
          repo: E2E_REPO,
          tree_sha: createdTreeSha,
          recursive: "1",
        });
        assert.equal(res.status, 200);
        const tree = res.body.data.tree as Array<{
          path: string;
          sha: string;
        }>;
        const match = tree.find((item) => item.path === EXTRA_FILE_PATH);
        assert(match, `Expected ${EXTRA_FILE_PATH} in tree.`);
        assert.equal(match.sha, createdBlobSha);
      });

      await step(t, "Part 2 step 9: git.createCommit", async () => {
        const res = await exec(primaryAgentKey, {
          actionName: "github.git.createCommit",
          owner: E2E_OWNER,
          repo: E2E_REPO,
          message: `commit ${runId}`,
          tree: createdTreeSha,
          stringifiedParents: JSON.stringify([fileCommitSha]),
        });
        assert.equal(res.status, 200);
        createdCommitSha = res.body.data.sha;
        assert.ok(createdCommitSha);
      });

      await step(t, "Part 2 step 10: git.getCommit matches inputs", async () => {
        const res = await exec(primaryAgentKey, {
          actionName: "github.git.getCommit",
          owner: E2E_OWNER,
          repo: E2E_REPO,
          commit_sha: createdCommitSha,
        });
        assert.equal(res.status, 200);
        assert.equal(res.body.data.sha, createdCommitSha);
        assert.equal(res.body.data.tree.sha, createdTreeSha);
        const parents = res.body.data.parents as Array<{ sha: string }>;
        assert.deepEqual(
          parents.map((p) => p.sha),
          [fileCommitSha],
        );
      });

      await step(t, "Part 2 step 11: git.updateRef HEAD", async () => {
        const updateRes = await exec(primaryAgentKey, {
          actionName: "github.git.updateRef",
          owner: E2E_OWNER,
          repo: E2E_REPO,
          ref: `heads/${HEAD_BRANCH}`,
          sha: createdCommitSha,
        });
        assert.equal(updateRes.status, 200);
        assert.equal(updateRes.body.data.object.sha, createdCommitSha);

        const verifyRes = await exec(primaryAgentKey, {
          actionName: "github.git.getRef",
          owner: E2E_OWNER,
          repo: E2E_REPO,
          ref: `heads/${HEAD_BRANCH}`,
        });
        assert.equal(verifyRes.status, 200);
        assert.equal(verifyRes.body.data.object.sha, createdCommitSha);
      });

      await step(t, "Part 2 step 12: pulls.create", async () => {
        const res = await exec(primaryAgentKey, {
          actionName: "github.pulls.create",
          owner: E2E_OWNER,
          repo: E2E_REPO,
          title: `gitrails e2e ${runId}`,
          body: `body ${runId}`,
          head: HEAD_BRANCH,
          base: BASE_BRANCH,
        });
        assert.equal(res.status, 200);
        pullNumber = res.body.data.number;
        assert.ok(pullNumber > 0);
      });

      await step(t, "Part 2 step 13: pulls.get", async () => {
        const res = await exec(primaryAgentKey, {
          actionName: "github.pulls.get",
          owner: E2E_OWNER,
          repo: E2E_REPO,
          pull_number: pullNumber,
        });
        assert.equal(res.status, 200);
        assert.equal(res.body.data.state, "open");
        assert.equal(res.body.data.head.ref, HEAD_BRANCH);
        assert.equal(res.body.data.base.ref, BASE_BRANCH);
      });

      await step(t, "Part 2 step 14: pulls.list contains pullNumber", async () => {
        const res = await exec(primaryAgentKey, {
          actionName: "github.pulls.list",
          owner: E2E_OWNER,
          repo: E2E_REPO,
          state: "open",
        });
        assert.equal(res.status, 200);
        const pulls = res.body.data as Array<{ number: number }>;
        assert.ok(pulls.some((p) => p.number === pullNumber));
      });

      await step(t, "Part 2 step 15: pulls.listCommits contains commit", async () => {
        const res = await exec(primaryAgentKey, {
          actionName: "github.pulls.listCommits",
          owner: E2E_OWNER,
          repo: E2E_REPO,
          pull_number: pullNumber,
        });
        assert.equal(res.status, 200);
        const commits = res.body.data as Array<{ sha: string }>;
        assert.ok(commits.some((c) => c.sha === createdCommitSha));
      });

      await step(t, "Part 2 step 16: pulls.listFiles contains path", async () => {
        const res = await exec(primaryAgentKey, {
          actionName: "github.pulls.listFiles",
          owner: E2E_OWNER,
          repo: E2E_REPO,
          pull_number: pullNumber,
        });
        assert.equal(res.status, 200);
        const files = res.body.data as Array<{ filename: string }>;
        const names = files.map((f) => f.filename);
        assert.ok(names.includes(FILE_PATH));
      });

      await step(t, "Part 2 step 17: pulls.update new title", async () => {
        const updateRes = await exec(primaryAgentKey, {
          actionName: "github.pulls.update",
          owner: E2E_OWNER,
          repo: E2E_REPO,
          pull_number: pullNumber,
          title: `gitrails e2e ${runId} updated`,
        });
        assert.equal(updateRes.status, 200);

        const verifyRes = await exec(primaryAgentKey, {
          actionName: "github.pulls.get",
          owner: E2E_OWNER,
          repo: E2E_REPO,
          pull_number: pullNumber,
        });
        assert.equal(verifyRes.status, 200);
        assert.equal(verifyRes.body.data.title, `gitrails e2e ${runId} updated`);
      });

      await step(t, "Part 2 step 18: pulls.merge (squash)", async () => {
        const mergeRes = await exec(primaryAgentKey, {
          actionName: "github.pulls.merge",
          owner: E2E_OWNER,
          repo: E2E_REPO,
          pull_number: pullNumber,
          merge_method: "squash",
        });
        assert.equal(mergeRes.status, 200);
        assert.equal(mergeRes.body.data.merged, true);

        const verifyRes = await exec(primaryAgentKey, {
          actionName: "github.pulls.get",
          owner: E2E_OWNER,
          repo: E2E_REPO,
          pull_number: pullNumber,
        });
        assert.equal(verifyRes.status, 200);
        assert.equal(verifyRes.body.data.merged, true);
        assert.equal(verifyRes.body.data.state, "closed");
      });

      await step(t, "Part 2 step 19: repos.deleteFile on BASE", async () => {
        // The squash merge replays our file onto BASE but yields the same
        // blob sha since the content is unchanged, so step 4's sha is valid.
        const deleteRes = await exec(primaryAgentKey, {
          actionName: "github.repos.deleteFile",
          owner: E2E_OWNER,
          repo: E2E_REPO,
          path: FILE_PATH,
          message: `delete ${FILE_PATH}`,
          sha: fileBlobSha,
          branch: BASE_BRANCH,
        });
        assert.equal(deleteRes.status, 200);

        const verifyRes = await exec(primaryAgentKey, {
          actionName: "github.repos.getContent",
          owner: E2E_OWNER,
          repo: E2E_REPO,
          path: FILE_PATH,
          ref: BASE_BRANCH,
        });
        assert.equal(verifyRes.status, 404);
      });

      await step(t, "Part 2 step 20: issues.create", async () => {
        const res = await exec(primaryAgentKey, {
          actionName: "github.issues.create",
          owner: E2E_OWNER,
          repo: E2E_REPO,
          title: ISSUE_TITLE,
          body: `issue body ${runId}`,
        });
        assert.equal(res.status, 200);
        issueNumber = res.body.data.number;
        assert.ok(issueNumber > 0);
      });

      await step(t, "Part 2 step 21: issues.list contains issueNumber", async () => {
        // GitHub's issues.listForRepo index is eventually consistent; a
        // freshly created issue can take a few seconds to appear. Poll with
        // short backoffs before failing.
        const deadline = Date.now() + 15_000;
        let lastCount = 0;
        while (Date.now() < deadline) {
          const res = await exec(primaryAgentKey, {
            actionName: "github.issues.list",
            owner: E2E_OWNER,
            repo: E2E_REPO,
            state: "open",
            per_page: 100,
          });
          assert.equal(res.status, 200);
          const issues = res.body.data as Array<{ number: number }>;
          lastCount = issues.length;
          if (issues.some((i) => i.number === issueNumber)) {
            return;
          }
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
        assert.fail(
          `Issue #${issueNumber} not found after 15s polling; last list had ${lastCount} issues.`,
        );
      });

      // -----------------------------------------------------------------------
      // Back to Part 1 — /requests and /requests/all after Part 2.
      // -----------------------------------------------------------------------

      await step(t, "GET /requests (after Part 2)", async () => {
        const res = await bearer(primaryAgentKey).get("/requests?limit=100");
        assert.equal(res.status, 200);
        assert.equal(
          res.body.total,
          agentExecSuccess.get(primaryAgentKey),
        );
      });

      await step(t, "GET /requests/all (after Part 2)", async () => {
        const res = await bearer(principalKey).get("/requests/all?limit=100");
        assert.equal(res.status, 200);
        assert.equal(res.body.total, principalExecSuccess);
      });

      // -----------------------------------------------------------------------
      // Part 3 — /execute cross-cutting behavior. Each subtest uses a fresh
      // key with scoped permissions so side-effects do not leak across cases.
      // -----------------------------------------------------------------------

      async function createScopedKey(
        prefix: string,
        permissions: Record<string, Record<string, string>>,
      ): Promise<string> {
        const createRes = await bearer(principalKey)
          .post("/agentKeys")
          .send({ prefix });
        assert.equal(createRes.status, 200);
        const { id, key } = createRes.body as { id: string; key: string };
        const permRes = await bearer(principalKey)
          .put(`/agentKeys/${id}/permissions`)
          .send({ permissions });
        assert.equal(permRes.status, 200);
        agentExecSuccess.set(key, 0);
        return key;
      }

      await step(t, "Part 3.1: unknown action → 400", async () => {
        const key = await createScopedKey("p3_unknown", buildFullPermissions());
        const res = await exec(key, { actionName: "github.nope" });
        assert.equal(res.status, 400);
      });

      await step(t, "Part 3.2: schema failure → 400 with details", async () => {
        const key = await createScopedKey("p3_schema", buildFullPermissions());
        const res = await exec(key, {
          actionName: "github.repos.get",
          owner: E2E_OWNER,
        });
        assert.equal(res.status, 400);
        assert.equal(res.body.error, "Request validation failed.");
        assert.ok(Array.isArray(res.body.details));
        assert.ok(res.body.details.length > 0);
      });

      await step(t, "Part 3.3: action not in perms → 403", async () => {
        const key = await createScopedKey("p3_noperms", {});
        const res = await exec(key, {
          actionName: "github.repos.get",
          owner: E2E_OWNER,
          repo: E2E_REPO,
        });
        assert.equal(res.status, 403);
      });

      await step(t, "Part 3.4: regex mismatch on required param → 403", async () => {
        const key = await createScopedKey("p3_regex_required", {
          "github.repos.get": { owner: "^otherorg$" },
        });
        const res = await exec(key, {
          actionName: "github.repos.get",
          owner: E2E_OWNER,
          repo: E2E_REPO,
        });
        assert.equal(res.status, 403);
        assert.match(res.body.error, /does not match constraint/);
      });

      await step(t, 
        "Part 3.5: regex fail-closed on omitted optional param → 403",
        async () => {
          const key = await createScopedKey("p3_regex_optional", {
            "github.repos.getContent": { ref: "^main$" },
          });
          const res = await exec(key, {
            actionName: "github.repos.getContent",
            owner: E2E_OWNER,
            repo: E2E_REPO,
            path: "README.md",
          });
          assert.equal(res.status, 403);
          assert.match(res.body.error, /required/i);
        },
      );

      await step(t, "Part 3.6: request log on success decrypts to request body", async () => {
        const key = await createScopedKey("p3_log_success", {
          "github.repos.get": {
            owner: `^${E2E_OWNER}$`,
            repo: `^${E2E_REPO}$`,
          },
        });
        const before = db
          .prepare("SELECT COUNT(*) AS c FROM requests")
          .get() as { c: number };
        const res = await exec(key, {
          actionName: "github.repos.get",
          owner: E2E_OWNER,
          repo: E2E_REPO,
        });
        assert.equal(res.status, 200);
        const after = db
          .prepare("SELECT COUNT(*) AS c FROM requests")
          .get() as { c: number };
        assert.equal(after.c, before.c + 1);
        const row = db
          .prepare(
            `SELECT r.encryptedRequest FROM requests r
             JOIN agentKeys ak ON r.agentKeyId = ak.id
             WHERE ak.keyHash = ?
             ORDER BY r.createdAt DESC LIMIT 1`,
          )
          .get(crypto.createHash("sha256").update(key).digest("hex")) as {
          encryptedRequest: string;
        };
        const decoded = JSON.parse(decrypt(row.encryptedRequest));
        assert.deepEqual(decoded, {
          actionName: "github.repos.get",
          owner: E2E_OWNER,
          repo: E2E_REPO,
        });
      });

      await step(t, "Part 3.7: no request log on permission denial", async () => {
        const key = await createScopedKey("p3_log_denied", {
          "github.repos.get": { owner: "^will-not-match$" },
        });
        const before = db
          .prepare("SELECT COUNT(*) AS c FROM requests")
          .get() as { c: number };
        const res = await exec(key, {
          actionName: "github.repos.get",
          owner: E2E_OWNER,
          repo: E2E_REPO,
        });
        assert.equal(res.status, 403);
        const after = db
          .prepare("SELECT COUNT(*) AS c FROM requests")
          .get() as { c: number };
        assert.equal(after.c, before.c);
      });

      // -----------------------------------------------------------------------
      // DELETE /agentKeys/:id — runs last per the plan.
      // -----------------------------------------------------------------------

      await step(t, "DELETE /agentKeys/:id revokes access", async () => {
        const createRes = await bearer(principalKey)
          .post("/agentKeys")
          .send({ prefix: "e2e_doomed" });
        assert.equal(createRes.status, 200);
        const { id: doomedId, key: doomedKey } = createRes.body as {
          id: string;
          key: string;
        };

        const deleteRes = await bearer(principalKey).delete(
          `/agentKeys/${doomedId}`,
        );
        assert.equal(deleteRes.status, 200);

        const listRes = await bearer(principalKey).get("/agentKeys");
        assert.equal(listRes.status, 200);
        const ids = (listRes.body as Array<{ id: string }>).map((r) => r.id);
        assert.ok(!ids.includes(doomedId));

        const probeRes = await bearer(doomedKey).get("/agentKeys/current");
        assert.equal(probeRes.status, 401);
      });
    } finally {
      // Close the open issue and delete both branches. Ignore failures so a
      // partial test still cleans up as much as possible.
      if (issueNumber > 0) {
        try {
          await installationOctokit.rest.issues.update({
            owner: E2E_OWNER,
            repo: E2E_REPO,
            issue_number: issueNumber,
            state: "closed",
          });
        } catch {
          // teardown is best-effort
        }
      }
      try {
        await deleteRefIfExists(`heads/${HEAD_BRANCH}`);
      } catch {
        // teardown is best-effort
      }
      try {
        await deleteRefIfExists(`heads/${BASE_BRANCH}`);
      } catch {
        // teardown is best-effort
      }

      db.close();
      await fs.rm(TEMP_DB_PATH, { force: true });
      await fs.rm(`${TEMP_DB_PATH}-shm`, { force: true });
      await fs.rm(`${TEMP_DB_PATH}-wal`, { force: true });
    }
  },
);
