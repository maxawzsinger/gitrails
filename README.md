<p align="center">
  <img src=".github/assets/logo.svg" alt="GitRails logo" width="480" />
</p>

# GitRails

## About

This server proxies a subset of the GitHub REST API.

It supports two credential types:

- `agent key`: used to call proxied GitHub endpoints through `POST /execute`
- `principal key`: used to manage agent keys and inspect account-level state

The GitHub App setup callback is the only endpoint that does not require authentication:

- `GET /principalKeys/github-app-callback`

Each agent key carries a `permissions` object. It allowlists:

- which proxied actions the agent may call
- which request parameters are allowed for each action

## Quickstart

This example gives an agent read access to `foo/` and write access to `foo/bar/` only.

### 1. Install the GitHub App and receive a principal key

Configure the GitHub App setup URL to point here:

```text
$BASE_URL/principalKeys/github-app-callback
```

After the GitHub App setup flow completes, copy the returned principal key. You will use it to create and manage agent keys.

If the app is later reinstalled on the same GitHub user or org, the setup flow rotates the existing principal key and deletes all agent keys associated with that principal.

### 2. Create an agent key

```sh
curl \
  -X POST \
  -H "Authorization: Bearer $PRINCIPAL_KEY" \
  -H "Content-Type: application/json" \
  "$BASE_URL/agentKeys/create" \
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

You can inspect request history with either a principal key or an agent key:

```sh
curl \
  -H "Authorization: Bearer $PRINCIPAL_KEY" \
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
- `src/routes/principalKeys.ts`: `GET /principalKeys/installations` lists visible GitHub App installations; `GET /principalKeys/github-app-callback` handles the GitHub App setup callback and returns a new principal key.

### Supported GitHub REST API endpoint definitions

These files define the supported request shapes for proxied GitHub actions.

Access file paths relative to this main URL: `https://github.com/maxawzsinger/gitrails/blob/main/`

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

For self-hosting, this proxy uses a GitHub App to identify itself to GitHub when it makes repo API calls. Create a GitHub App with `Contents`, `Pull requests`, `Issues`, and `Metadata` permissions, set the app's setup URL to `$BASE_URL/principalKeys/github-app-callback`, and install it on the target user or org repos. The proxy stores one principal per GitHub installation target, so reinstalling the app on the same target rotates the principal key and deletes the associated agent keys. Set `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`, `ENCRYPTION_KEY`, `DATABASE_PATH`, and `PORT`; `DATABASE_PATH` should be on persistent storage, and `ENCRYPTION_KEY` must remain stable across deploys.
