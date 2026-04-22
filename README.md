<p align="center">
  <img src=".github/assets/logo.svg" alt="GitRails logo" width="480" />
</p>

# GitRails

## About

This server exists to let humans safely grant (AI) agents tightly scoped access to the GitHub API via managed keys and per-endpoint (and per-parameter) permissions.

Currently we

There are three user types:

End users (usually humans) install the Gitrails app on a personal or org account and receive a principal key.

Principals (human or AI) authenticate with that principal key and handle administrative tasks, including provisioning and managing agent keys.

Agents (usually AI) authenticate with an agent key and call the proxied GitHub API endpoints. Each agent key is associated with a permissions object of type:

```ts
type Perms = {
  "github.repos.get"?: {
    owner?: string; // regex
    repo?: string; // regex
  };
  "github.repos.getContent"?: {
    owner?: string; // regex
    repo?: string; // regex
    path?: string; // regex
    ref?: string; // regex
  };
  "github.git.getRef"?: {
    owner?: string; // regex
    repo?: string; // regex
    ref?: string; // regex
  };
  "github.git.getCommit"?: {
    owner?: string; // regex
    repo?: string; // regex
    commit_sha?: string; // regex
  };
  "github.git.getTree"?: {
    owner?: string; // regex
    repo?: string; // regex
    tree_sha?: string; // regex
    recursive?: string; // regex
  };
  "github.git.getBlob"?: {
    owner?: string; // regex
    repo?: string; // regex
    file_sha?: string; // regex
  };
  "github.repos.createOrUpdateFileContents"?: {
    owner?: string; // regex
    repo?: string; // regex
    path?: string; // regex
    message?: string; // regex
    content?: string; // regex
    sha?: string; // regex
    branch?: string; // regex
    stringifiedCommitter?: string; // regex
    stringifiedAuthor?: string; // regex
  };
  "github.repos.deleteFile"?: {
    owner?: string; // regex
    repo?: string; // regex
    path?: string; // regex
    message?: string; // regex
    sha?: string; // regex
    branch?: string; // regex
    stringifiedCommitter?: string; // regex
    stringifiedAuthor?: string; // regex
  };
  "github.git.createBlob"?: {
    owner?: string; // regex
    repo?: string; // regex
    content?: string; // regex
    encoding?: string; // regex
  };
  "github.git.createTree"?: {
    owner?: string; // regex
    repo?: string; // regex
    stringifiedTree?: string; // regex
    base_tree?: string; // regex
  };
  "github.git.createCommit"?: {
    owner?: string; // regex
    repo?: string; // regex
    message?: string; // regex
    tree?: string; // regex
    stringifiedParents?: string; // regex
    stringifiedAuthor?: string; // regex
    stringifiedCommitter?: string; // regex
    signature?: string; // regex
  };
  "github.git.updateRef"?: {
    owner?: string; // regex
    repo?: string; // regex
    ref?: string; // regex
    sha?: string; // regex
    force?: string; // regex
  };
  "github.pulls.create"?: {
    owner?: string; // regex
    repo?: string; // regex
    title?: string; // regex
    head?: string; // regex
    head_repo?: string; // regex
    base?: string; // regex
    body?: string; // regex
    maintainer_can_modify?: string; // regex
    draft?: string; // regex
    issue?: string; // regex
  };
  "github.pulls.list"?: {
    owner?: string; // regex
    repo?: string; // regex
    state?: string; // regex
    head?: string; // regex
    base?: string; // regex
    sort?: string; // regex
    direction?: string; // regex
    per_page?: string; // regex
    page?: string; // regex
  };
  "github.pulls.get"?: {
    owner?: string; // regex
    repo?: string; // regex
    pull_number?: string; // regex
  };
  "github.pulls.update"?: {
    owner?: string; // regex
    repo?: string; // regex
    pull_number?: string; // regex
    title?: string; // regex
    body?: string; // regex
    state?: string; // regex
    base?: string; // regex
    maintainer_can_modify?: string; // regex
  };
  "github.pulls.merge"?: {
    owner?: string; // regex
    repo?: string; // regex
    pull_number?: string; // regex
    commit_title?: string; // regex
    commit_message?: string; // regex
    merge_method?: string; // regex
    sha?: string; // regex
  };
  "github.pulls.listFiles"?: {
    owner?: string; // regex
    repo?: string; // regex
    pull_number?: string; // regex
    per_page?: string; // regex
    page?: string; // regex
  };
  "github.pulls.listCommits"?: {
    owner?: string; // regex
    repo?: string; // regex
    pull_number?: string; // regex
    per_page?: string; // regex
    page?: string; // regex
  };
  "github.issues.create"?: {
    owner?: string; // regex
    repo?: string; // regex
    title?: string; // regex
    body?: string; // regex
    assignee?: string; // regex
    milestone?: string; // regex
    stringifiedLabels?: string; // regex
    stringifiedAssignees?: string; // regex
    type?: string; // regex
  };
  "github.issues.list"?: {
    owner?: string; // regex
    repo?: string; // regex
    milestone?: string; // regex
    state?: string; // regex
    assignee?: string; // regex
    type?: string; // regex
    creator?: string; // regex
    mentioned?: string; // regex
    labels?: string; // regex
    sort?: string; // regex
    direction?: string; // regex
    since?: string; // regex
    per_page?: string; // regex
    page?: string; // regex
  };
};
```

When an agent calls `/execute`, the proxy loads the permissions for that agent key. The request is allowed only if the action exists as a top-level permission key, and any configured param constraints match the stringified param values. This is how the proxy restricts which GitHub REST API actions and params the agent may use.

Example scenarios:

1. Action is present, with no param constraints: allowed.

Alice Agent's permissions:

```json
{
  "github.issues.create": {}
}
```

Alice Agent calls POST /execute with this request body

```json
{
  "actionName": "github.issues.create",
  "owner": "acme",
  "repo": "proxy-github",
  "title": "Bug report",
  "body": "Steps to reproduce..."
}
```

Behavior: allowed. The action exists in the permissions object, and there are no param regex checks for this action.

2. Action is missing: denied.

Alice Agent's permissions:

```json
{
  "github.issues.create": {}
}
```

Alice Agent calls POST /execute with this request body

```json
{
  "actionName": "github.repos.deleteFile",
  "owner": "acme",
  "repo": "proxy-github",
  "path": "README.md",
  "message": "delete file",
  "sha": "abc123"
}
```

Behavior: rejected with `403`. `github.repos.deleteFile` is not a top-level permission key.

3. Action is present, and constrained params match: allowed.

Alice Agent's permissions:

```json
{
  "github.issues.create": {
    "owner": "^acme$",
    "repo": "^proxy-github$"
  }
}
```

Alice Agent calls POST /execute with this request body

```json
{
  "actionName": "github.issues.create",
  "owner": "acme",
  "repo": "proxy-github",
  "title": "Bug report"
}
```

Behavior: allowed. The proxy stringifies `owner` and `repo`, then both values match their configured regex.

4. Action is present, but a constrained param does not match: denied.

Alice Agent's permissions:

```json
{
  "github.issues.create": {
    "owner": "^acme$",
    "repo": "^proxy-github$"
  }
}
```

Alice Agent calls POST /execute with this request body

```json
{
  "actionName": "github.issues.create",
  "owner": "other-org",
  "repo": "proxy-github",
  "title": "Bug report"
}
```

Behavior: rejected with `403`. The stringified `owner` value `other-org` does not match `^acme$`.

Endpoints that require agent key:

`GET /agentKeys/current`
Returns the authenticated agent key row, including its prefix and current permissions.

```sh
curl \
  -H "Authorization: Bearer $AGENT_KEY" \
  "$BASE_URL/agentKeys/current"
```

`GET /requests`
Returns the request log for the authenticated agent key.

Required params: none.

Optional query params: `page`, `limit`.

```sh
curl \
  -H "Authorization: Bearer $AGENT_KEY" \
  "$BASE_URL/requests?page=1&limit=50"
```

`POST /execute`
Executes one allowed proxied GitHub action using the authenticated agent key.

Required body: one of the TypeScript shapes below.

If a field name starts with `stringified`, pass a JSON string, not a nested JSON value. Example: `stringifiedLabels: "[\"bug\",\"priority:high\"]"`. The proxy returns `400` if parsing that string does not produce valid JSON.

### Repository actions

`github.repos.get`

```ts
type GitHubReposGetBody = {
  actionName: "github.repos.get"; // fetch repository metadata; example: "github.repos.get"
  owner: string; // repo owner or org; example: "acme"
  repo: string; // repo name without .git; example: "monorepo"
};
```

`github.repos.getContent`

```ts
type GitHubReposGetContentBody = {
  actionName: "github.repos.getContent"; // fetch a file or directory; example: "github.repos.getContent"
  owner: string; // repo owner or org; example: "acme"
  repo: string; // repo name without .git; example: "monorepo"
  path: string; // file or directory path; example: "foo/README.md"
  ref?: string; // optional branch, tag, or commit sha; example: "main"
};
```

`github.repos.createOrUpdateFileContents`

```ts
type GitHubReposCreateOrUpdateFileContentsBody = {
  actionName: "github.repos.createOrUpdateFileContents"; // create or replace one file; example: "github.repos.createOrUpdateFileContents"
  owner: string; // repo owner or org; example: "acme"
  repo: string; // repo name without .git; example: "monorepo"
  path: string; // path to create or update; example: "docs/hello.txt"
  message: string; // commit message; example: "update hello.txt"
  content: string; // plaintext file contents; example: "hello from the proxy"
  sha?: string; // optional on create, required on update; example: "abc123"
  branch?: string; // optional target branch; example: "main"
  stringifiedCommitter?: string; // optional JSON string for the committer object; example: "{\"name\":\"Acme Bot\",\"email\":\"bot@example.com\"}"
  stringifiedAuthor?: string; // optional JSON string for the author object; example: "{\"name\":\"Acme Bot\",\"email\":\"bot@example.com\"}"
};
```

`github.repos.deleteFile`

```ts
type GitHubReposDeleteFileBody = {
  actionName: "github.repos.deleteFile"; // delete one file; example: "github.repos.deleteFile"
  owner: string; // repo owner or org; example: "acme"
  repo: string; // repo name without .git; example: "monorepo"
  path: string; // path to delete; example: "docs/hello.txt"
  message: string; // commit message; example: "delete hello.txt"
  sha: string; // blob sha of the file being deleted; example: "abc123"
  branch?: string; // optional target branch; example: "main"
  stringifiedCommitter?: string; // optional JSON string for committer; example: "{\"name\":\"Acme Bot\",\"email\":\"bot@example.com\"}"
  stringifiedAuthor?: string; // optional JSON string for author; example: "{\"name\":\"Acme Bot\",\"email\":\"bot@example.com\"}"
};
```

### Git database actions

`github.git.createBlob`

```ts
type GitHubGitCreateBlobBody = {
  actionName: "github.git.createBlob"; // create a blob object; example: "github.git.createBlob"
  owner: string; // repo owner or org; example: "acme"
  repo: string; // repo name without .git; example: "monorepo"
  content: string; // blob contents; example: "hello world"
  encoding?: "utf-8" | "base64"; // optional blob encoding; example: "utf-8"
};
```

`github.git.getBlob`

```ts
type GitHubGitGetBlobBody = {
  actionName: "github.git.getBlob"; // fetch one blob by sha; example: "github.git.getBlob"
  owner: string; // repo owner or org; example: "acme"
  repo: string; // repo name without .git; example: "monorepo"
  file_sha: string; // blob sha; example: "abc123"
};
```

`github.git.createTree`

```ts
type GitHubGitCreateTreeBody = {
  actionName: "github.git.createTree"; // create a git tree object; example: "github.git.createTree"
  owner: string; // repo owner or org; example: "acme"
  repo: string; // repo name without .git; example: "monorepo"
  stringifiedTree: string; // required JSON string for the tree array; example: "[{\"path\":\"file.txt\",\"mode\":\"100644\",\"type\":\"blob\",\"content\":\"hello\"}]"
  base_tree?: string; // optional existing tree sha to patch on top of; example: "abc123"
};
```

`github.git.getTree`

```ts
type GitHubGitGetTreeBody = {
  actionName: "github.git.getTree"; // fetch a tree by sha or ref; example: "github.git.getTree"
  owner: string; // repo owner or org; example: "acme"
  repo: string; // repo name without .git; example: "monorepo"
  tree_sha: string; // tree sha or ref name; example: "abc123"
  recursive?: string; // optional; any string enables recursive traversal; example: "1"
};
```

`github.git.createCommit`

```ts
type GitHubGitCreateCommitBody = {
  actionName: "github.git.createCommit"; // create a git commit object; example: "github.git.createCommit"
  owner: string; // repo owner or org; example: "acme"
  repo: string; // repo name without .git; example: "monorepo"
  message: string; // commit message; example: "commit from proxy"
  tree: string; // sha of the tree the commit should point to; example: "abc123"
  stringifiedParents?: string; // optional JSON string for the parents array; example: "[\"parent-sha\"]"
  stringifiedAuthor?: string; // optional JSON string for author; example: "{\"name\":\"Acme Bot\",\"email\":\"bot@example.com\"}"
  stringifiedCommitter?: string; // optional JSON string for committer; example: "{\"name\":\"Acme Bot\",\"email\":\"bot@example.com\"}"
  signature?: string; // optional detached ASCII-armored PGP signature; example: "-----BEGIN PGP SIGNATURE-----..."
};
```

`github.git.getCommit`

```ts
type GitHubGitGetCommitBody = {
  actionName: "github.git.getCommit"; // fetch one git commit object; example: "github.git.getCommit"
  owner: string; // repo owner or org; example: "acme"
  repo: string; // repo name without .git; example: "monorepo"
  commit_sha: string; // commit sha; example: "abc123"
};
```

`github.git.getRef`

```ts
type GitHubGitGetRefBody = {
  actionName: "github.git.getRef"; // fetch one git ref; example: "github.git.getRef"
  owner: string; // repo owner or org; example: "acme"
  repo: string; // repo name without .git; example: "monorepo"
  ref: string; // full git ref; example: "heads/main"
};
```

`github.git.updateRef`

```ts
type GitHubGitUpdateRefBody = {
  actionName: "github.git.updateRef"; // move a git ref to a new sha; example: "github.git.updateRef"
  owner: string; // repo owner or org; example: "acme"
  repo: string; // repo name without .git; example: "monorepo"
  ref: string; // full git ref; example: "heads/main"
  sha: string; // target sha; example: "abc123"
  force?: boolean; // optional force non-fast-forward update; example: false
};
```

### Pull request actions

`github.pulls.create`

```ts
type GitHubPullsCreateBody = {
  actionName: "github.pulls.create"; // open a new pull request; example: "github.pulls.create"
  owner: string; // repo owner or org; example: "acme"
  repo: string; // repo name without .git; example: "monorepo"
  title?: string; // optional, but required unless issue is provided; example: "Add docs"
  head: string; // source branch, or owner:branch for cross-repo PRs; example: "feature/docs"
  head_repo?: string; // optional, required for some same-org cross-repo PRs; example: "monorepo-fork"
  base: string; // target branch; example: "main"
  body?: string; // optional PR body; example: "This updates the docs."
  maintainer_can_modify?: boolean; // optional allow maintainers to push to the head branch; example: true
  draft?: boolean; // optional create as a draft PR; example: false
  issue?: number; // optional, but required unless title is provided; example: 123
};
```

`github.pulls.get`

```ts
type GitHubPullsGetBody = {
  actionName: "github.pulls.get"; // fetch one pull request; example: "github.pulls.get"
  owner: string; // repo owner or org; example: "acme"
  repo: string; // repo name without .git; example: "monorepo"
  pull_number: number; // pull request number; example: 123
};
```

`github.pulls.list`

```ts
type GitHubPullsListBody = {
  actionName: "github.pulls.list"; // list pull requests; example: "github.pulls.list"
  owner: string; // repo owner or org; example: "acme"
  repo: string; // repo name without .git; example: "monorepo"
  state?: "open" | "closed" | "all"; // optional state filter; example: "open"
  head?: string; // optional head owner/org and branch filter; example: "acme:feature/docs"
  base?: string; // optional base branch filter; example: "main"
  sort?: "created" | "updated" | "popularity" | "long-running"; // optional sort field; example: "updated"
  direction?: "asc" | "desc"; // optional sort direction; example: "desc"
  per_page?: number; // optional page size, 1-100; example: 50
  page?: number; // optional page number, starting at 1; example: 1
};
```

`github.pulls.listCommits`

```ts
type GitHubPullsListCommitsBody = {
  actionName: "github.pulls.listCommits"; // list commits on a pull request; example: "github.pulls.listCommits"
  owner: string; // repo owner or org; example: "acme"
  repo: string; // repo name without .git; example: "monorepo"
  pull_number: number; // pull request number; example: 123
  per_page?: number; // optional page size, 1-100; example: 50
  page?: number; // optional page number, starting at 1; example: 1
};
```

`github.pulls.listFiles`

```ts
type GitHubPullsListFilesBody = {
  actionName: "github.pulls.listFiles"; // list changed files on a pull request; example: "github.pulls.listFiles"
  owner: string; // repo owner or org; example: "acme"
  repo: string; // repo name without .git; example: "monorepo"
  pull_number: number; // pull request number; example: 123
  per_page?: number; // optional page size, 1-100; example: 50
  page?: number; // optional page number, starting at 1; example: 1
};
```

`github.pulls.update`

```ts
type GitHubPullsUpdateBody = {
  actionName: "github.pulls.update"; // edit an existing pull request; example: "github.pulls.update"
  owner: string; // repo owner or org; example: "acme"
  repo: string; // repo name without .git; example: "monorepo"
  pull_number: number; // pull request number; example: 123
  title?: string; // optional new PR title; example: "Rename the PR"
  body?: string; // optional new PR body; example: "Updated description."
  state?: "open" | "closed"; // optional PR state; example: "open"
  base?: string; // optional new base branch; example: "main"
  maintainer_can_modify?: boolean; // optional allow maintainers to push to the head branch; example: true
};
```

`github.pulls.merge`

```ts
type GitHubPullsMergeBody = {
  actionName: "github.pulls.merge"; // merge a pull request; example: "github.pulls.merge"
  owner: string; // repo owner or org; example: "acme"
  repo: string; // repo name without .git; example: "monorepo"
  pull_number: number; // pull request number; example: 123
  commit_title?: string; // optional title for the merge commit; example: "Merge PR #123"
  commit_message?: string; // optional extra merge commit body text; example: "Approved."
  merge_method?: "merge" | "squash" | "rebase"; // optional merge strategy; example: "squash"
  sha?: string; // optional require the PR head sha to match before merging; example: "abc123"
};
```

### Issue actions

`github.issues.create`

```ts
type GitHubIssuesCreateBody = {
  actionName: "github.issues.create"; // open a new issue; example: "github.issues.create"
  owner: string; // repo owner or org; example: "acme"
  repo: string; // repo name without .git; example: "monorepo"
  title: string; // issue title; example: "Bug report"
  body?: string; // optional issue body; example: "Steps to reproduce..."
  assignee?: string; // optional one assignee login; example: "octocat"
  milestone?: number; // optional milestone number; example: 1
  stringifiedLabels?: string; // optional JSON string for labels array; example: "[\"bug\",\"priority:high\"]"
  stringifiedAssignees?: string; // optional JSON string for assignees array; example: "[\"octocat\",\"hubot\"]"
  type?: string; // optional issue type name; example: "Bug"
};
```

`github.issues.list`

```ts
type GitHubIssuesListBody = {
  actionName: "github.issues.list"; // list issues for one repository; example: "github.issues.list"
  owner: string; // repo owner or org; example: "acme"
  repo: string; // repo name without .git; example: "monorepo"
  milestone?: number | "*" | "none"; // optional milestone filter; example: 1
  state?: "open" | "closed" | "all"; // optional state filter; example: "open"
  assignee?: string; // optional assignee filter; example: "octocat"
  type?: string; // optional issue type filter; example: "Bug"
  creator?: string; // optional creator filter; example: "octocat"
  mentioned?: string; // optional mentioned-user filter; example: "hubot"
  labels?: string; // optional comma-separated label names; example: "bug,ui,@high"
  sort?: "created" | "updated" | "comments"; // optional sort field; example: "updated"
  direction?: "asc" | "desc"; // optional sort direction; example: "desc"
  since?: string; // optional ISO 8601 timestamp; example: "2026-01-01T00:00:00Z"
  per_page?: number; // optional page size, 1-100; example: 50
  page?: number; // optional page number, starting at 1; example: 1
};
```

```sh
curl \
  -X POST \
  -H "Authorization: Bearer $AGENT_KEY" \
  -H "Content-Type: application/json" \
  "$BASE_URL/execute" \
  -d '{
    "actionName": "github.repos.createOrUpdateFileContents",
    "owner": "acme",
    "repo": "monorepo",
    "path": "docs/hello.txt",
    "message": "update hello.txt",
    "content": "hello from the proxy",
    "stringifiedCommitter": "{\"name\":\"Acme Bot\",\"email\":\"bot@example.com\"}"
  }'
```

principal key:

`GET /agentKeys`
Returns all agent keys owned by the authenticated GitHub target.

```sh
curl \
  -H "Authorization: Bearer $PRINCIPAL_KEY" \
  "$BASE_URL/agentKeys"
```

`POST /agentKeys`
Creates a new agent key with the given prefix and an empty permissions object.

Required body: `{ "prefix": string }` where `prefix` uses lowercase letters and underscores only and becomes `gr_<prefix>_<secret>`.

```sh
curl \
  -X POST \
  -H "Authorization: Bearer $PRINCIPAL_KEY" \
  -H "Content-Type: application/json" \
  "$BASE_URL/agentKeys" \
  -d '{
    "prefix": "docs_agent"
  }'
```

`DELETE /agentKeys/:id`
Deletes the specified agent key if it belongs to the authenticated GitHub target.

Required path params: `id` (agent key id).

```sh
curl \
  -X DELETE \
  -H "Authorization: Bearer $PRINCIPAL_KEY" \
  "$BASE_URL/agentKeys/$AGENT_KEY_ID"
```

`PUT /agentKeys/:id/permissions`
Replaces the entire permissions policy for the specified agent key.

Required path params: `id` (agent key id).

Required body: `{ "permissions": ... }` as the full replacement permissions object.

```sh
curl \
  -X PUT \
  -H "Authorization: Bearer $PRINCIPAL_KEY" \
  -H "Content-Type: application/json" \
  "$BASE_URL/agentKeys/$AGENT_KEY_ID/permissions" \
  -d '{
    "permissions": {
      "github.repos.getContent": {
        "owner": "^acme$",
        "repo": "^monorepo$",
        "path": "^(foo|foo/.*)$"
      }
    }
  }'
```

`GET /requests/all`
Returns the request log across all agent keys owned by the authenticated GitHub target.

Required params: none.

Optional query params: `page`, `limit`.

```sh
curl \
  -H "Authorization: Bearer $PRINCIPAL_KEY" \
  "$BASE_URL/requests/all?page=1&limit=50"
```

It supports two credential types:

## Quickstart

This example gives an agent read access to `foo/` and write access to `foo/bar/` only.

### 1. Install the GitHub App and receive a principal key

Configure the GitHub App setup URL to point here:

```text
$BASE_URL/githubTargets/github-app-callback
```

After the GitHub App setup flow completes, copy the returned principal key. You will use it to create and manage agent keys.

If the app is later reinstalled on the same GitHub user or org, the setup flow rotates the existing principal key and preserves the existing agent keys associated with that target.

### 2. Create an agent key

```sh
curl \
  -X POST \
  -H "Authorization: Bearer $PRINCIPAL_KEY" \
  -H "Content-Type: application/json" \
  "$BASE_URL/agentKeys" \
  -d '{
    "prefix": "docs_agent"
  }'
```

Save the returned agent key. This is the credential the agent will use when calling `POST /execute`.

### 3. Set permissions on the new agent key

This example grants:

- read access to `foo/`
- write access to `foo/bar/`

```sh
curl \
  -X PUT \
  -H "Authorization: Bearer $PRINCIPAL_KEY" \
  -H "Content-Type: application/json" \
  "$BASE_URL/agentKeys/<agent-key-id>/permissions" \
  -d '{
    "permissions": {
      "github.repos.getContent": {
        "owner": "^acme$",
        "repo": "^monorepo$",
        "path": "^(foo|foo/.*)$"
      },
      "github.repos.createOrUpdateFileContents": {
        "owner": "^acme$",
        "repo": "^monorepo$",
        "path": "^(foo/bar|foo/bar/.*)$"
      },
      "github.repos.deleteFile": {
        "owner": "^acme$",
        "repo": "^monorepo$",
        "path": "^(foo/bar|foo/bar/.*)$"
      }
    }
  }'
```

### 4. Read from the allowed subtree with the agent key

This succeeds because `foo/README.md` is inside the allowed read subtree.

```sh
curl \
  -X POST \
  -H "Authorization: Bearer $AGENT_KEY" \
  -H "Content-Type: application/json" \
  "$BASE_URL/execute" \
  -d '{
    "actionName": "github.repos.getContent",
    "owner": "acme",
    "repo": "monorepo",
    "path": "foo/README.md"
  }'
```

### 5. Write inside the nested allowed subtree with the agent key

This succeeds because `foo/bar/hello.txt` is inside the allowed write subtree.

```sh
curl \
  -X POST \
  -H "Authorization: Bearer $AGENT_KEY" \
  -H "Content-Type: application/json" \
  "$BASE_URL/execute" \
  -d '{
    "actionName": "github.repos.createOrUpdateFileContents",
    "owner": "acme",
    "repo": "monorepo",
    "path": "foo/bar/hello.txt",
    "message": "create foo/bar/hello.txt",
    "content": "hello from the proxy"
  }'
```

### 6. Inspect request history

Use an agent key to inspect only that agent's own request history:

```sh
curl \
  -H "Authorization: Bearer $AGENT_KEY" \
  "$BASE_URL/requests"
```

Use a principal key to inspect all requests for the GitHub target:

```sh
curl \
  -H "Authorization: Bearer $PRINCIPAL_KEY" \
  "$BASE_URL/requests/all"
```

## Self-hosting

For self-hosting, this proxy uses a GitHub App to identify itself to GitHub when it makes repo API calls. Create a GitHub App with `Contents`, `Pull requests`, `Issues`, and `Metadata` permissions, set the app's setup URL to `$BASE_URL/githubTargets/github-app-callback`, and install it on the target user or org repos. The proxy stores one `githubTargets` row per GitHub installation target, so reinstalling the app on the same target rotates that target's principal key while preserving the associated agent keys. Set `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`, `ENCRYPTION_KEY`, `DATABASE_PATH`, and `PORT`; `DATABASE_PATH` should be on persistent storage, and `ENCRYPTION_KEY` must remain stable across deploys.
