import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import type { RestEndpointMethodTypes } from "@octokit/plugin-rest-endpoint-methods";
import request from "supertest";
import {
  ROOT_DIR,
  TEST_DATABASE_PATH,
  TEST_GITHUB_EMAIL,
  TEST_GITHUB_REPO,
  TEST_GITHUB_TOKEN,
} from "./config.js";

const GITHUB_API_BASE_URL = "https://api.github.com";
// Keep the raw GitHub calls explicit so each verification reads like a live API interaction.
const GITHUB_API_HEADERS = {
  Accept: "application/vnd.github+json",
  Authorization: `Bearer ${TEST_GITHUB_TOKEN}`,
  "Content-Type": "application/json",
  "User-Agent": "proxy-github-e2e-test",
  "X-GitHub-Api-Version": "2022-11-28",
} as const;
type RetryUntilResult<T> = { done: boolean; value: T };
type LoggedHttpResponse =
  | Response
  | {
      status: number;
      text?: string;
      body?: unknown;
    };

// GitHub file contents are base64 encoded and may include newlines in the payload.
function decodeGitHubContent(content: string): string {
  return Buffer.from(content.replace(/\n/g, ""), "base64").toString("utf8");
}

// The GitHub API is eventually consistent around repo creation and deletion.
async function retryUntil<T>(
  action: (attempt: number) => Promise<RetryUntilResult<T>>,
  options: {
    attempts: number;
    delayMs: number;
    getFailureMessage: (value: T) => string | Promise<string>;
  },
): Promise<T> {
  let lastValue: T | undefined;

  for (let attempt = 0; attempt < options.attempts; attempt += 1) {
    const result = await action(attempt);
    lastValue = result.value;

    if (result.done) {
      return result.value;
    }

    if (attempt < options.attempts - 1) {
      await new Promise((resolve) => {
        setTimeout(resolve, options.delayMs);
      });
    }
  }

  if (lastValue === undefined) {
    throw new Error("retryUntil() requires at least one attempt.");
  }

  throw new Error(await options.getFailureMessage(lastValue));
}

function isFetchResponse(response: LoggedHttpResponse): response is Response {
  return typeof (response as Response).clone === "function";
}

function serializePayload(value: unknown): string {
  if (value === undefined || value === null || value === "") {
    return "<empty>";
  }
  if (typeof value === "string") {
    return value;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

async function getResponsePayload(response: LoggedHttpResponse): Promise<string> {
  if (isFetchResponse(response)) {
    return serializePayload(await response.clone().text());
  }
  if (response.text) {
    return serializePayload(response.text);
  }
  return serializePayload(response.body);
}

async function assertStatus(response: LoggedHttpResponse, expected: number, label: string): Promise<void> {
  if (response.status === expected) {
    return;
  }
  const payload = await getResponsePayload(response);
  assert.equal(
    response.status,
    expected,
    `${label} failed with status ${response.status}. Payload: ${payload}`,
  );
}

async function assertStatuses(response: LoggedHttpResponse, expected: number[], label: string): Promise<void> {
  if (expected.includes(response.status)) {
    return;
  }
  const payload = await getResponsePayload(response);
  assert(
    expected.includes(response.status),
    `${label} failed with status ${response.status}. Expected one of ${expected.join(", ")}. Payload: ${payload}`,
  );
}

test(
  "proxy github end-to-end",
  {
    timeout: 180_000,
  },
  async () => {
    const repo = TEST_GITHUB_REPO;
    // Identify the authenticated GitHub user so the test can target the correct owner.
    const githubUserResponse = await fetch(`${GITHUB_API_BASE_URL}/user`, {
      method: "GET",
      headers: GITHUB_API_HEADERS,
    });
    await assertStatus(githubUserResponse, 200, "githubUserResponse");
    const githubUser =
      (await githubUserResponse.json()) as RestEndpointMethodTypes["users"]["getAuthenticated"]["response"]["data"];

    // Reuse the repo across runs; only create it the first time.
    const existingRepoResponse = await fetch(`${GITHUB_API_BASE_URL}/repos/${githubUser.login}/${repo}`, {
      method: "GET",
      headers: GITHUB_API_HEADERS,
    });
    await assertStatuses(existingRepoResponse, [200, 404], "existingRepoResponse");
    if (existingRepoResponse.status === 404) {
      await retryUntil(
        async () => {
          const createRepoResponse = await fetch(`${GITHUB_API_BASE_URL}/user/repos`, {
            method: "POST",
            headers: GITHUB_API_HEADERS,
            body: JSON.stringify({
              name: repo,
              description: "Disposable repo for proxy-github e2e tests.",
              private: true,
              auto_init: true,
            }),
          });

          return {
            done: createRepoResponse.status === 201,
            value: createRepoResponse,
          };
        },
        {
          attempts: 10,
          delayMs: 1000,
          getFailureMessage: async (response) =>
            `Failed to create ${githubUser.login}/${repo}: ${await response.text()}`,
        },
      );
    }

    // Reset the local sqlite files so the test controls the entire application state.
    const databasePath = path.resolve(ROOT_DIR, TEST_DATABASE_PATH);
    await fs.rm(databasePath, { force: true });
    await fs.rm(`${databasePath}-shm`, { force: true });
    await fs.rm(`${databasePath}-wal`, { force: true });

    const { db } = await import("../src/db.js");

    // Seed a principle key directly so the rest of the test can exercise app behavior without a real OAuth callback.
    const principleKey = `pk_${crypto.randomBytes(32).toString("hex")}`;
    db.prepare(
      "INSERT INTO users (id, githubId, githubLogin, principleKeyHash, createdAt) VALUES (?, ?, ?, ?, ?)",
    ).run(
      crypto.randomUUID(),
      String(githubUser.id),
      githubUser.login,
      crypto.createHash("sha256").update(principleKey).digest("hex"),
      Date.now(),
    );
    const { app } = await import("../src/app.js");

    try {
      const owner = githubUser.login;
      const runId = `${Date.now()}`;
      const repoFilePath = `proxy-e2e-${runId}/content.txt`;
      const branchName = `proxy-e2e-${runId}`;
      const branchFilePath = `proxy-e2e-${runId}/branch.txt`;
      const issueTitle = `proxy issue ${runId}`;
      const pullTitle = `proxy pull ${runId}`;

      // OAuth entrypoint should redirect the browser to GitHub rather than handling auth inline.
      const redirectResponse = await request(app)
        .get("/users/sign-in-with-oauth-and-rotate-principle-key")
        .redirects(0);
      await assertStatus(redirectResponse, 302, "redirectResponse");
      assert.match(
        redirectResponse.headers.location ?? "",
        /^https:\/\/github\.com\/login\/oauth\/authorize\?/,
      );

      // Validate the unhappy-path auth and authorization responses before doing any privileged work.
      const missingCodeResponse = await request(app).get("/users/oauth-flow-callback");
      await assertStatus(missingCodeResponse, 400, "missingCodeResponse");
      assert.equal(missingCodeResponse.text, "Missing code parameter.");

      const requestsWithoutAuth = await request(app).get("/requests");
      await assertStatus(requestsWithoutAuth, 401, "requestsWithoutAuth");
      assert.equal(requestsWithoutAuth.body.error, "Missing Authorization header.");

      const invalidKeyRequests = await request(app)
        .get("/requests")
        .set("Authorization", "Bearer pk_invalid");
      await assertStatus(invalidKeyRequests, 401, "invalidKeyRequests");
      assert.equal(
        invalidKeyRequests.body.error,
        "Invalid principle key or agent key.",
      );

      // A seeded principle key should see the user's GitHub App installations.
      const installationsResponse = await request(app)
        .get("/users/installations")
        .set("Authorization", `Bearer ${principleKey}`);
      await assertStatus(installationsResponse, 200, "installationsResponse");
      const installationsBody = installationsResponse.body as {
        installations: Array<{ account?: string }>;
      };
      assert(
        installationsBody.installations.some(
          (installation) => installation.account === owner,
        ),
        `Expected GitHub App installation for ${owner}.`,
      );

      // New users start with no agent keys, and principle keys cannot impersonate an agent key.
      const initialKeysResponse = await request(app)
        .get("/agentKeys")
        .set("Authorization", `Bearer ${principleKey}`);
      await assertStatus(initialKeysResponse, 200, "initialKeysResponse");
      const initialKeysBody = initialKeysResponse.body as Array<{ id: string }>;
      assert.equal(initialKeysBody.length, 0);

      const currentWithPrincipleKey = await request(app)
        .get("/agentKeys/current")
        .set("Authorization", `Bearer ${principleKey}`);
      await assertStatus(currentWithPrincipleKey, 403, "currentWithPrincipleKey");

      // Prefix validation keeps agent-key identifiers URL-safe and predictable.
      const badPrefixResponse = await request(app)
        .post("/agentKeys/create")
        .set("Authorization", `Bearer ${principleKey}`)
        .send({
          prefix: "Bad Prefix",
        });
      await assertStatus(badPrefixResponse, 400, "badPrefixResponse");

      // Create the primary agent key that will drive the rest of the proxy exercise.
      const createdKeyResponse = await request(app)
        .post("/agentKeys/create")
        .set("Authorization", `Bearer ${principleKey}`)
        .send({
          prefix: "e_primary",
        });
      await assertStatus(createdKeyResponse, 200, "createdKeyResponse");
      const createdKeyBody = createdKeyResponse.body as {
        id: string;
        prefix: string;
        key: string;
      };
      assert.equal(createdKeyBody.prefix, "e_primary");
      const primaryAgentKeyId = createdKeyBody.id;
      const primaryAgentKey = createdKeyBody.key;

      // Agent keys should not be able to administer other keys.
      const listWithAgentKey = await request(app)
        .get("/agentKeys")
        .set("Authorization", `Bearer ${primaryAgentKey}`);
      await assertStatus(listWithAgentKey, 403, "listWithAgentKey");

      const currentWithAgentKey = await request(app)
        .get("/agentKeys/current")
        .set("Authorization", `Bearer ${primaryAgentKey}`);
      await assertStatus(currentWithAgentKey, 200, "currentWithAgentKey");
      const currentWithAgentKeyBody = currentWithAgentKey.body as {
        id: string;
        prefix: string;
        permissions: Record<string, unknown>;
      };
      assert.equal(currentWithAgentKeyBody.id, primaryAgentKeyId);
      assert.deepEqual(currentWithAgentKeyBody.permissions, {});

      // Without permissions, the proxy should reject execution even with a valid agent key.
      const executeWithoutPermission = await request(app)
        .post("/execute")
        .set("Authorization", `Bearer ${primaryAgentKey}`)
        .send({
          actionName: "github.repos.get",
          owner,
          repo,
        });
      await assertStatus(executeWithoutPermission, 403, "executeWithoutPermission");

      const invalidPermissionsResponse = await request(app)
        .put(`/agentKeys/${primaryAgentKeyId}/permissions`)
        .set("Authorization", `Bearer ${principleKey}`)
        .send({
            permissions: {
              "github.fake.missing": {},
            },
          });
      await assertStatus(invalidPermissionsResponse, 400, "invalidPermissionsResponse");

      const scopedPermissions = {
        "github.repos.getContent": {
          owner: `^${owner}$`,
          repo: `^${repo}$`,
          path: "^allowed/.*$",
        },
      };

      // First prove that regex constraints are enforced before broadening permissions.
      const scopedPermissionsResponse = await request(app)
        .put(`/agentKeys/${primaryAgentKeyId}/permissions`)
        .set("Authorization", `Bearer ${principleKey}`)
        .send({
          permissions: scopedPermissions,
        });
      await assertStatus(scopedPermissionsResponse, 200, "scopedPermissionsResponse");
      assert.equal(scopedPermissionsResponse.body.ok, true);

      const regexDeniedResponse = await request(app)
        .post("/execute")
        .set("Authorization", `Bearer ${primaryAgentKey}`)
        .send({
          actionName: "github.repos.getContent",
          owner,
          repo,
          path: "README.md",
        });
      await assertStatus(regexDeniedResponse, 403, "regexDeniedResponse");
      assert.match(regexDeniedResponse.body.error, /does not match constraint/);

      // Then grant the full set of actions needed for the end-to-end GitHub workflow.
      const allPermissions = {
        "github.repos.get": {
          owner: `^${owner}$`,
          repo: `^${repo}$`,
        },
        "github.repos.getContent": {
          owner: `^${owner}$`,
          repo: `^${repo}$`,
        },
        "github.git.getRef": {
          owner: `^${owner}$`,
          repo: `^${repo}$`,
        },
        "github.git.getCommit": {
          owner: `^${owner}$`,
          repo: `^${repo}$`,
        },
        "github.git.getTree": {
          owner: `^${owner}$`,
          repo: `^${repo}$`,
        },
        "github.git.getBlob": {
          owner: `^${owner}$`,
          repo: `^${repo}$`,
        },
        "github.repos.createOrUpdateFileContents": {
          owner: `^${owner}$`,
          repo: `^${repo}$`,
        },
        "github.repos.deleteFile": {
          owner: `^${owner}$`,
          repo: `^${repo}$`,
        },
        "github.git.createBlob": {
          owner: `^${owner}$`,
          repo: `^${repo}$`,
        },
        "github.git.createTree": {
          owner: `^${owner}$`,
          repo: `^${repo}$`,
        },
        "github.git.createCommit": {
          owner: `^${owner}$`,
          repo: `^${repo}$`,
        },
        "github.git.updateRef": {
          owner: `^${owner}$`,
          repo: `^${repo}$`,
        },
        "github.pulls.create": {
          owner: `^${owner}$`,
          repo: `^${repo}$`,
        },
        "github.pulls.list": {
          owner: `^${owner}$`,
          repo: `^${repo}$`,
        },
        "github.pulls.get": {
          owner: `^${owner}$`,
          repo: `^${repo}$`,
        },
        "github.pulls.update": {
          owner: `^${owner}$`,
          repo: `^${repo}$`,
        },
        "github.pulls.merge": {
          owner: `^${owner}$`,
          repo: `^${repo}$`,
        },
        "github.pulls.listFiles": {
          owner: `^${owner}$`,
          repo: `^${repo}$`,
        },
        "github.pulls.listCommits": {
          owner: `^${owner}$`,
          repo: `^${repo}$`,
        },
        "github.issues.create": {
          owner: `^${owner}$`,
          repo: `^${repo}$`,
        },
        "github.issues.list": {
          owner: `^${owner}$`,
          repo: `^${repo}$`,
        },
      };

      const fullPermissionsResponse = await request(app)
        .put(`/agentKeys/${primaryAgentKeyId}/permissions`)
        .set("Authorization", `Bearer ${principleKey}`)
        .send({
          permissions: allPermissions,
        });
      await assertStatus(fullPermissionsResponse, 200, "fullPermissionsResponse");
      assert.equal(fullPermissionsResponse.body.ok, true);

      // Exercise request validation separately from permission enforcement.
      const missingActionResponse = await request(app)
        .post("/execute")
        .set("Authorization", `Bearer ${primaryAgentKey}`)
        .send({});
      await assertStatus(missingActionResponse, 400, "missingActionResponse");

      const unknownActionResponse = await request(app)
        .post("/execute")
        .set("Authorization", `Bearer ${primaryAgentKey}`)
        .send({
          actionName: "github.unknown.action",
        });
      await assertStatus(unknownActionResponse, 400, "unknownActionResponse");

      const validationFailureResponse = await request(app)
        .post("/execute")
        .set("Authorization", `Bearer ${primaryAgentKey}`)
        .send({
          actionName: "github.repos.get",
          owner,
        });
      await assertStatus(validationFailureResponse, 400, "validationFailureResponse");
      assert.equal(validationFailureResponse.body.error, "Request validation failed.");

      // Principle keys are management credentials, not execution credentials.
      const executeWithPrincipleKey = await request(app)
        .post("/execute")
        .set("Authorization", `Bearer ${principleKey}`)
        .send({
          actionName: "github.repos.get",
          owner,
          repo,
        });
      await assertStatus(executeWithPrincipleKey, 403, "executeWithPrincipleKey");

      // Read the repo through the proxy and capture the default branch for later git operations.
      const repoResponse = await request(app)
        .post("/execute")
        .set("Authorization", `Bearer ${primaryAgentKey}`)
        .send({
          actionName: "github.repos.get",
          owner,
          repo,
        });
      await assertStatus(repoResponse, 200, "repoResponse");
      const repoBody = repoResponse.body as RestEndpointMethodTypes["repos"]["get"]["response"]["data"];
      assert.equal(repoBody.full_name, `${owner}/${repo}`);
      const defaultBranch = repoBody.default_branch;
      assert(defaultBranch, `Expected ${owner}/${repo} to have a default branch.`);

      const readmeExistsResponse = await fetch(`${GITHUB_API_BASE_URL}/repos/${owner}/${repo}/contents/README.md`, {
        method: "GET",
        headers: GITHUB_API_HEADERS,
      });
      await assertStatuses(readmeExistsResponse, [200, 404], "readmeExistsResponse");
      if (readmeExistsResponse.status === 404) {
        const createReadmeResponse = await fetch(
          `${GITHUB_API_BASE_URL}/repos/${owner}/${repo}/contents/${encodeURIComponent("README.md")}`,
          {
            method: "PUT",
            headers: GITHUB_API_HEADERS,
            body: JSON.stringify({
              message: "initialize README for e2e tests",
              content: Buffer.from(`# ${repo}\n`).toString("base64"),
              branch: defaultBranch,
            }),
          },
        );
        await assertStatus(createReadmeResponse, 201, "createReadmeResponse");
      }

      // Walk the default branch objects through content/ref/commit/tree/blob endpoints.
      const readmeResponse = await request(app)
        .post("/execute")
        .set("Authorization", `Bearer ${primaryAgentKey}`)
        .send({
          actionName: "github.repos.getContent",
          owner,
          repo,
          path: "README.md",
        });
      await assertStatus(readmeResponse, 200, "readmeResponse");
      const readmeBody =
        readmeResponse.body as Extract<RestEndpointMethodTypes["repos"]["getContent"]["response"]["data"], { type: "file" }>;
      assert.equal(readmeBody.path, "README.md");

      const defaultRefResponse = await request(app)
        .post("/execute")
        .set("Authorization", `Bearer ${primaryAgentKey}`)
        .send({
          actionName: "github.git.getRef",
          owner,
          repo,
          ref: `heads/${defaultBranch}`,
        });
      await assertStatus(defaultRefResponse, 200, "defaultRefResponse");
      const defaultRefBody = defaultRefResponse.body as RestEndpointMethodTypes["git"]["getRef"]["response"]["data"];
      assert.equal(defaultRefBody.ref, `refs/heads/${defaultBranch}`);

      const baseCommitResponse = await request(app)
        .post("/execute")
        .set("Authorization", `Bearer ${primaryAgentKey}`)
        .send({
          actionName: "github.git.getCommit",
          owner,
          repo,
          commit_sha: defaultRefBody.object.sha,
        });
      await assertStatus(baseCommitResponse, 200, "baseCommitResponse");
      const baseCommitBody = baseCommitResponse.body as RestEndpointMethodTypes["git"]["getCommit"]["response"]["data"];
      assert.equal(baseCommitBody.sha, defaultRefBody.object.sha);

      const baseTreeResponse = await request(app)
        .post("/execute")
        .set("Authorization", `Bearer ${primaryAgentKey}`)
        .send({
          actionName: "github.git.getTree",
          owner,
          repo,
          tree_sha: baseCommitBody.tree.sha,
          recursive: "1",
        });
      await assertStatus(baseTreeResponse, 200, "baseTreeResponse");
      const baseTreeBody = baseTreeResponse.body as RestEndpointMethodTypes["git"]["getTree"]["response"]["data"];
      const readmeBlob = baseTreeBody.tree.find((item) => item.path === "README.md");
      assert(readmeBlob?.sha, "Expected README.md blob in the default tree.");

      const blobResponse = await request(app)
        .post("/execute")
        .set("Authorization", `Bearer ${primaryAgentKey}`)
        .send({
          actionName: "github.git.getBlob",
          owner,
          repo,
          file_sha: readmeBlob.sha,
        });
      await assertStatus(blobResponse, 200, "blobResponse");
      const blobBody = blobResponse.body as { sha: string; content: string };
      assert.equal(blobBody.sha, readmeBlob.sha);
      assert.match(decodeGitHubContent(blobBody.content), /# /);

      // Create a file through the proxy, then confirm the content directly from GitHub.
      const createFileResponse = await request(app)
        .post("/execute")
        .set("Authorization", `Bearer ${primaryAgentKey}`)
        .send({
          actionName: "github.repos.createOrUpdateFileContents",
          owner,
          repo,
          path: repoFilePath,
          message: `create ${repoFilePath}`,
          content: `proxy create ${runId}`,
        });
      await assertStatus(createFileResponse, 200, "createFileResponse");
      const createFileBody = createFileResponse.body as {
        content: {
          sha: string;
          path: string;
        };
      };
      assert.equal(createFileBody.content.path, repoFilePath);

      const directCreatedFileResponse = await fetch(
        `${GITHUB_API_BASE_URL}/repos/${owner}/${repo}/contents/${repoFilePath}`,
        {
          method: "GET",
          headers: GITHUB_API_HEADERS,
        },
      );
      await assertStatus(directCreatedFileResponse, 200, "directCreatedFileResponse");
      const directCreatedFile =
        (await directCreatedFileResponse.json()) as Extract<
          RestEndpointMethodTypes["repos"]["getContent"]["response"]["data"],
          { type: "file" }
        >;
      assert.equal(
        decodeGitHubContent(directCreatedFile.content),
        `proxy create ${runId}`,
      );

      // Create a feature branch directly so later proxy git actions can build a commit on top of it.
      const createRefResponse = await fetch(`${GITHUB_API_BASE_URL}/repos/${owner}/${repo}/git/refs`, {
        method: "POST",
        headers: GITHUB_API_HEADERS,
        body: JSON.stringify({
          ref: `refs/heads/${branchName}`,
          sha: defaultRefBody.object.sha,
        }),
      });
      await assertStatus(createRefResponse, 201, "createRefResponse");

      // Build a commit manually through blob/tree/commit/update-ref to cover the lower-level git APIs.
      const createdBlobResponse = await request(app)
        .post("/execute")
        .set("Authorization", `Bearer ${primaryAgentKey}`)
        .send({
          actionName: "github.git.createBlob",
          owner,
          repo,
          content: `branch content ${runId}`,
          encoding: "utf-8",
        });
      await assertStatus(createdBlobResponse, 200, "createdBlobResponse");

      const createdBlobBody = createdBlobResponse.body as { sha: string };

      const createdTreeResponse = await request(app)
        .post("/execute")
        .set("Authorization", `Bearer ${primaryAgentKey}`)
        .send({
          actionName: "github.git.createTree",
          owner,
          repo,
          base_tree: baseCommitBody.tree.sha,
          tree: [
            {
              path: branchFilePath,
              mode: "100644",
              type: "blob",
              sha: createdBlobBody.sha,
            },
          ],
        });
      await assertStatus(createdTreeResponse, 200, "createdTreeResponse");

      const createdTreeBody = createdTreeResponse.body as { sha: string };

      const createdCommitResponse = await request(app)
        .post("/execute")
        .set("Authorization", `Bearer ${primaryAgentKey}`)
        .send({
          actionName: "github.git.createCommit",
          owner,
          repo,
          message: `commit ${runId}`,
          tree: createdTreeBody.sha,
          parents: [defaultRefBody.object.sha],
          author: {
            name: owner,
            email: TEST_GITHUB_EMAIL,
          },
        });
      await assertStatus(createdCommitResponse, 200, "createdCommitResponse");

      const createdCommitBody = createdCommitResponse.body as { sha: string };

      const updateRefResponse = await request(app)
        .post("/execute")
        .set("Authorization", `Bearer ${primaryAgentKey}`)
        .send({
          actionName: "github.git.updateRef",
          owner,
          repo,
          ref: `heads/${branchName}`,
          sha: createdCommitBody.sha,
        });
      await assertStatus(updateRefResponse, 200, "updateRefResponse");
      const updateRefBody = updateRefResponse.body as RestEndpointMethodTypes["git"]["updateRef"]["response"]["data"];
      assert.equal(updateRefBody.object.sha, createdCommitBody.sha);

      // Confirm the branch file is visible from GitHub on the new branch.
      const directBranchFileResponse = await fetch(
        `${GITHUB_API_BASE_URL}/repos/${owner}/${repo}/contents/${branchFilePath}?ref=${encodeURIComponent(branchName)}`,
        {
          method: "GET",
          headers: GITHUB_API_HEADERS,
        },
      );
      await assertStatus(directBranchFileResponse, 200, "directBranchFileResponse");
      const directBranchFile =
        (await directBranchFileResponse.json()) as Extract<
          RestEndpointMethodTypes["repos"]["getContent"]["response"]["data"],
          { type: "file" }
        >;
      assert.equal(
        decodeGitHubContent(directBranchFile.content),
        `branch content ${runId}`,
      );

      // Drive the full pull request lifecycle through the proxy.
      const createdPullResponse = await request(app)
        .post("/execute")
        .set("Authorization", `Bearer ${primaryAgentKey}`)
        .send({
          actionName: "github.pulls.create",
          owner,
          repo,
          title: pullTitle,
          body: `body ${runId}`,
          head: branchName,
          base: defaultBranch,
        });
      await assertStatus(createdPullResponse, 200, "createdPullResponse");
      const createdPullBody = createdPullResponse.body as RestEndpointMethodTypes["pulls"]["create"]["response"]["data"];
      const pullNumber = createdPullBody.number;

      const listPullsResponse = await request(app)
        .post("/execute")
        .set("Authorization", `Bearer ${primaryAgentKey}`)
        .send({
          actionName: "github.pulls.list",
          owner,
          repo,
          state: "open",
        });
      await assertStatus(listPullsResponse, 200, "listPullsResponse");
      const listPullsBody = listPullsResponse.body as RestEndpointMethodTypes["pulls"]["list"]["response"]["data"];
      assert(listPullsBody.some((pull) => pull.number === pullNumber));

      const getPullResponse = await request(app)
        .post("/execute")
        .set("Authorization", `Bearer ${primaryAgentKey}`)
        .send({
          actionName: "github.pulls.get",
          owner,
          repo,
          pull_number: pullNumber,
        });
      await assertStatus(getPullResponse, 200, "getPullResponse");
      const getPullBody = getPullResponse.body as RestEndpointMethodTypes["pulls"]["get"]["response"]["data"];
      assert.equal(getPullBody.title, pullTitle);

      const updatedPullResponse = await request(app)
        .post("/execute")
        .set("Authorization", `Bearer ${primaryAgentKey}`)
        .send({
          actionName: "github.pulls.update",
          owner,
          repo,
          pull_number: pullNumber,
          title: `${pullTitle} updated`,
          body: `updated ${runId}`,
        });
      await assertStatus(updatedPullResponse, 200, "updatedPullResponse");
      const updatedPullBody = updatedPullResponse.body as RestEndpointMethodTypes["pulls"]["update"]["response"]["data"];
      assert.equal(updatedPullBody.title, `${pullTitle} updated`);

      const pullFilesResponse = await request(app)
        .post("/execute")
        .set("Authorization", `Bearer ${primaryAgentKey}`)
        .send({
          actionName: "github.pulls.listFiles",
          owner,
          repo,
          pull_number: pullNumber,
        });
      await assertStatus(pullFilesResponse, 200, "pullFilesResponse");
      const pullFilesBody = pullFilesResponse.body as Array<{ filename: string }>;
      assert(
        pullFilesBody.some((file) => file.filename === branchFilePath),
      );

      const pullCommitsResponse = await request(app)
        .post("/execute")
        .set("Authorization", `Bearer ${primaryAgentKey}`)
        .send({
          actionName: "github.pulls.listCommits",
          owner,
          repo,
          pull_number: pullNumber,
        });
      await assertStatus(pullCommitsResponse, 200, "pullCommitsResponse");
      const pullCommitsBody = pullCommitsResponse.body as Array<{ sha: string }>;
      assert(
        pullCommitsBody.some(
          (commit) => commit.sha === createdCommitBody.sha,
        ),
      );

      const mergePullResponse = await request(app)
        .post("/execute")
        .set("Authorization", `Bearer ${primaryAgentKey}`)
        .send({
          actionName: "github.pulls.merge",
          owner,
          repo,
          pull_number: pullNumber,
          merge_method: "merge",
        });
      await assertStatus(mergePullResponse, 200, "mergePullResponse");
      const mergePullBody = mergePullResponse.body as {
        merged: boolean;
        sha: string;
      };
      assert.equal(mergePullBody.merged, true);

      // Verify the merge through GitHub rather than trusting the proxy response alone.
      const mergedPullDirectResponse = await fetch(
        `${GITHUB_API_BASE_URL}/repos/${owner}/${repo}/pulls/${pullNumber}`,
        {
          method: "GET",
          headers: GITHUB_API_HEADERS,
        },
      );
      await assertStatus(mergedPullDirectResponse, 200, "mergedPullDirectResponse");
      const mergedPullDirect =
        (await mergedPullDirectResponse.json()) as RestEndpointMethodTypes["pulls"]["get"]["response"]["data"];
      assert.ok(mergedPullDirect.merged_at);

      const mergedBranchFileResponse = await fetch(
        `${GITHUB_API_BASE_URL}/repos/${owner}/${repo}/contents/${branchFilePath}`,
        {
          method: "GET",
          headers: GITHUB_API_HEADERS,
        },
      );
      await assertStatus(mergedBranchFileResponse, 200, "mergedBranchFileResponse");
      const mergedBranchFile =
        (await mergedBranchFileResponse.json()) as Extract<
          RestEndpointMethodTypes["repos"]["getContent"]["response"]["data"],
          { type: "file" }
        >;
      assert.equal(
        decodeGitHubContent(mergedBranchFile.content),
        `branch content ${runId}`,
      );

      // Issue creation/listing is exercised separately from the PR flow.
      const createdIssueResponse = await request(app)
        .post("/execute")
        .set("Authorization", `Bearer ${primaryAgentKey}`)
        .send({
          actionName: "github.issues.create",
          owner,
          repo,
          title: issueTitle,
          body: `issue body ${runId}`,
        });
      await assertStatus(createdIssueResponse, 200, "createdIssueResponse");
      const createdIssueBody = createdIssueResponse.body as RestEndpointMethodTypes["issues"]["create"]["response"]["data"];
      const issueNumber = createdIssueBody.number;

      const listIssuesBody = await retryUntil(
        async () => {
          const listIssuesResponse = await request(app)
            .post("/execute")
            .set("Authorization", `Bearer ${primaryAgentKey}`)
            .send({
              actionName: "github.issues.list",
              owner,
              repo,
              state: "open",
            });
          await assertStatus(listIssuesResponse, 200, "listIssuesResponse");
          const body =
            listIssuesResponse.body as RestEndpointMethodTypes["issues"]["listForRepo"]["response"]["data"];
          return {
            done: body.some((issue) => issue.number === issueNumber),
            value: body,
          };
        },
        {
          attempts: 10,
          delayMs: 1000,
          getFailureMessage: (body) =>
            `Timed out waiting for issue #${issueNumber} to appear in issues.list. Received issues: ${body
              .map((issue) => issue.number)
              .join(", ")}`,
        },
      );
      assert(listIssuesBody.some((issue) => issue.number === issueNumber));

      const directIssueResponse = await fetch(
        `${GITHUB_API_BASE_URL}/repos/${owner}/${repo}/issues/${issueNumber}`,
        {
          method: "GET",
          headers: GITHUB_API_HEADERS,
        },
      );
      await assertStatus(directIssueResponse, 200, "directIssueResponse");
      const directIssue =
        (await directIssueResponse.json()) as RestEndpointMethodTypes["issues"]["get"]["response"]["data"];
      assert.equal(directIssue.title, issueTitle);

      // File deletion needs the latest blob sha, so fetch content first and then delete.
      const contentBeforeDelete = await request(app)
        .post("/execute")
        .set("Authorization", `Bearer ${primaryAgentKey}`)
        .send({
          actionName: "github.repos.getContent",
          owner,
          repo,
          path: repoFilePath,
        });
      await assertStatus(contentBeforeDelete, 200, "contentBeforeDelete");

      const contentBeforeDeleteBody =
        contentBeforeDelete.body as Extract<
          RestEndpointMethodTypes["repos"]["getContent"]["response"]["data"],
          { type: "file" }
        >;

      const deleteFileResponse = await request(app)
        .post("/execute")
        .set("Authorization", `Bearer ${primaryAgentKey}`)
        .send({
          actionName: "github.repos.deleteFile",
          owner,
          repo,
          path: repoFilePath,
          message: `delete ${repoFilePath}`,
          sha: contentBeforeDeleteBody.sha,
        });
      await assertStatus(deleteFileResponse, 200, "deleteFileResponse");

      // Confirm the deletion against GitHub directly.
      const deletedFileResponse = await fetch(
        `${GITHUB_API_BASE_URL}/repos/${owner}/${repo}/contents/${repoFilePath}`,
        {
          method: "GET",
          headers: GITHUB_API_HEADERS,
        },
      );
      await assertStatus(deletedFileResponse, 404, "deletedFileResponse");

      // The principle key should see the broader request history for all agent activity.
      const principleRequestsResponse = await request(app)
        .get("/requests")
        .set("Authorization", `Bearer ${principleKey}`);
      await assertStatus(principleRequestsResponse, 200, "principleRequestsResponse");
      const principleRequestsBody = principleRequestsResponse.body as {
        total: number;
        requests: Array<{
          agentKeyPrefix: string;
          request: {
            actionName?: string;
          };
        }>;
      };
      assert(
        principleRequestsBody.requests.some(
          (request) => request.request.actionName === "github.pulls.merge",
        ),
      );

      // Create a second key to prove request history and permissions are scoped per agent key.
      const secondKeyResponse = await request(app)
        .post("/agentKeys/create")
        .set("Authorization", `Bearer ${principleKey}`)
        .send({
          prefix: "e_secondary",
        });
      await assertStatus(secondKeyResponse, 200, "secondKeyResponse");
      const secondKeyBody = secondKeyResponse.body as {
        id: string;
        key: string;
      };

      const secondKeyPermissionsResponse = await request(app)
        .put(`/agentKeys/${secondKeyBody.id}/permissions`)
        .set("Authorization", `Bearer ${principleKey}`)
        .send({
            permissions: {
              "github.repos.get": {
                owner: `^${owner}$`,
                repo: `^${repo}$`,
              },
            },
          });
      await assertStatus(secondKeyPermissionsResponse, 200, "secondKeyPermissionsResponse");

      const secondKeyExecuteResponse = await request(app)
        .post("/execute")
        .set("Authorization", `Bearer ${secondKeyBody.key}`)
        .send({
          actionName: "github.repos.get",
          owner,
          repo,
        });
      await assertStatus(secondKeyExecuteResponse, 200, "secondKeyExecuteResponse");

      // The second key should only see its own single request.
      const secondKeyRequestsResponse = await request(app)
        .get("/requests")
        .set("Authorization", `Bearer ${secondKeyBody.key}`);
      await assertStatus(secondKeyRequestsResponse, 200, "secondKeyRequestsResponse");
      const secondKeyRequestsBody = secondKeyRequestsResponse.body as {
        total: number;
        requests: Array<{
          request: {
            actionName?: string;
          };
        }>;
      };
      assert.equal(secondKeyRequestsBody.total, 1);
      assert.equal(
        secondKeyRequestsBody.requests[0]?.request.actionName,
        "github.repos.get",
      );

      const primaryKeyRequestsResponse = await request(app)
        .get("/requests")
        .set("Authorization", `Bearer ${primaryAgentKey}`);
      await assertStatus(primaryKeyRequestsResponse, 200, "primaryKeyRequestsResponse");
      const primaryKeyRequestsBody = primaryKeyRequestsResponse.body as {
        total: number;
      };
      assert(primaryKeyRequestsBody.total > secondKeyRequestsBody.total);

      // Deletion should fail for unknown ids and revoke access for deleted keys.
      const deleteMissingKeyResponse = await request(app)
        .delete("/agentKeys/not-a-real-key")
        .set("Authorization", `Bearer ${principleKey}`);
      await assertStatus(deleteMissingKeyResponse, 404, "deleteMissingKeyResponse");

      const deleteSecondKeyResponse = await request(app)
        .delete(`/agentKeys/${secondKeyBody.id}`)
        .set("Authorization", `Bearer ${principleKey}`);
      await assertStatus(deleteSecondKeyResponse, 200, "deleteSecondKeyResponse");
      assert.equal(deleteSecondKeyResponse.body.ok, true);

      const deletedSecondKeyAccess = await request(app)
        .get("/agentKeys/current")
        .set("Authorization", `Bearer ${secondKeyBody.key}`);
      await assertStatus(deletedSecondKeyAccess, 401, "deletedSecondKeyAccess");
    } finally {
      // Close the sqlite handle even if a mid-test assertion fails.
      db.close();
    }
  },
);
