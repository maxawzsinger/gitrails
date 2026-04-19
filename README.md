<p align="center">
  <img src=".github/assets/logo.svg" alt="GitRails logo" width="480" />
</p>

# GitRails

## About

This server proxies a subset of the GitHub REST API.

It supports two credential types:

- `agent key`: used to call proxied GitHub endpoints through `POST /execute`
- `principle key`: used to manage agent keys and inspect account-level state

The OAuth bootstrap endpoint is the only endpoint that does not require authentication:

- `GET /users/sign-in-with-oauth-and-rotate-principle-key`

Each agent key carries a `permissions` object. It allowlists:

- which proxied actions the agent may call
- which request parameters are allowed for each action

## Quickstart

This example gives an agent read access to `foo/` and write access to `foo/bar/` only.

### 1. Create or rotate a principle key

Open this URL in your browser:

```text
$BASE_URL/users/sign-in-with-oauth-and-rotate-principle-key
```

After the OAuth flow completes, copy the returned principle key. You will use it to create and manage agent keys.

### 2. Install the GitHub App on the target repo

Install the GitHub App on the repository or repositories you want this proxy to access.

### 3. Create an agent key

```sh
curl \
  -X POST \
  -H "Authorization: Bearer $PRINCIPLE_KEY" \
  -H "Content-Type: application/json" \
  "$BASE_URL/agentKeys/create" \
  -d '{
    "prefix": "docs_agent"
  }'
```

Save the returned agent key. This is the credential the agent will use when calling `POST /execute`.

### 4. Set permissions on the new agent key

This example grants:

- read access to `foo/`
- write access to `foo/bar/`

```sh
curl \
  -X PUT \
  -H "Authorization: Bearer $PRINCIPLE_KEY" \
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

### 5. Read from the allowed subtree with the agent key

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

### 6. Write inside the nested allowed subtree with the agent key

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

### 7. Inspect request history

You can inspect request history with either a principle key or an agent key:

```sh
curl \
  -H "Authorization: Bearer $PRINCIPLE_KEY" \
  "$BASE_URL/requests"
```

## Most important files to understand

### Core validation and storage

- `src/lib/validatePerms.ts`: defines the permissions object type and the validation rules for it.
- `src/db.ts`: contains the database schema.

### Server endpoints and auth requirements

- `src/routes/agentKeys.ts`: `GET /agentKeys` lists your agent keys; `GET /agentKeys/current` fetches the current agent key; `POST /agentKeys/create` creates an agent key; `DELETE /agentKeys/:id` deletes an agent key; `PUT /agentKeys/:id/permissions` replaces a key's permissions.
- `src/routes/execute.ts`: `POST /execute` validates, authorizes, executes, and logs a proxied GitHub action.
- `src/routes/requests.ts`: `GET /requests` lists logged requests and responses, scoped to the caller.
- `src/routes/users.ts`: `GET /users/installations` lists visible GitHub App installations; `GET /users/sign-in-with-oauth-and-rotate-principle-key` starts OAuth and issues or rotates a principle key; `GET /users/oauth-flow-callback` handles OAuth callback, creates or updates the user, and returns the new principle key.

### Supported GitHub REST API endpoint definitions

These files define the supported request shapes for proxied GitHub actions.

If you are driving this API from an AI agent, inspect these files at call time instead of loading all of them at once. Reading the entire list up front is likely to waste context:

- `src/lib/endpoints/github.git.createBlob.ts`
- `src/lib/endpoints/github.git.createCommit.ts`
- `src/lib/endpoints/github.git.createTree.ts`
- `src/lib/endpoints/github.git.getBlob.ts`
- `src/lib/endpoints/github.git.getCommit.ts`
- `src/lib/endpoints/github.git.getRef.ts`
- `src/lib/endpoints/github.git.getTree.ts`
- `src/lib/endpoints/github.git.updateRef.ts`
- `src/lib/endpoints/github.issues.create.ts`
- `src/lib/endpoints/github.issues.list.ts`
- `src/lib/endpoints/github.pulls.create.ts`
- `src/lib/endpoints/github.pulls.get.ts`
- `src/lib/endpoints/github.pulls.list.ts`
- `src/lib/endpoints/github.pulls.listCommits.ts`
- `src/lib/endpoints/github.pulls.listFiles.ts`
- `src/lib/endpoints/github.pulls.merge.ts`
- `src/lib/endpoints/github.pulls.update.ts`
- `src/lib/endpoints/github.repos.createOrUpdateFileContents.ts`
- `src/lib/endpoints/github.repos.deleteFile.ts`
- `src/lib/endpoints/github.repos.get.ts`
- `src/lib/endpoints/github.repos.getContent.ts`

## Self-hosting

For self-hosting, this proxy uses a GitHub App to identify itself to GitHub when it makes repo API calls, and a GitHub OAuth App to identify the admin who can create and rotate the principle key. So you need to configure both: create a GitHub App with `Contents`, `Pull requests`, `Issues`, and `Metadata` permissions, install it on the target user or org repos, then create a GitHub OAuth App with callback URL ``$BASE_URL/users/oauth-flow-callback``. Set `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `ENCRYPTION_KEY`, `DATABASE_PATH`, `PORT`, and `BASE_URL`; `BASE_URL` must be the public external URL, `DATABASE_PATH` should be on persistent storage, and `ENCRYPTION_KEY` must remain stable across deploys.
