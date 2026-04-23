import { z } from "zod/v4";
import { baseRequestSchema, type EndpointObject } from "../endpointTypes.js";
import { getInstallationOctokit } from "../octokit.js";
import { parseStringifiedJson } from "../stringifiedJson.js";

const committerSchema = z.object({
  name: z.string(),
  email: z.string(),
  date: z.string().optional(),
});
const authorSchema = z.object({
  name: z.string(),
  email: z.string(),
  date: z.string().optional(),
});

const requestSchema = baseRequestSchema.extend({
  actionName: z.literal("github.repos.createOrUpdateFileContents"),
  owner: z.string(),
  repo: z.string(),
  path: z.string(),
  message: z.string(),
  content: z.string(),
  sha: z.string().optional(),
  branch: z.string().optional(),
  stringifiedCommitter: z.string().optional(),
  stringifiedAuthor: z.string().optional(),
});

export const endpoint: EndpointObject<typeof requestSchema> = {
  requestSchema,
  executeRequest: async (request) => {
    const octokit = await getInstallationOctokit(request.owner, request.repo);
    const committer = request.stringifiedCommitter
      ? parseStringifiedJson(
          request.stringifiedCommitter,
          "stringifiedCommitter",
          committerSchema,
        )
      : undefined;
    const author = request.stringifiedAuthor
      ? parseStringifiedJson(
          request.stringifiedAuthor,
          "stringifiedAuthor",
          authorSchema,
        )
      : undefined;
    // API requires base64 content; accept plaintext and encode here
    const contentBase64 = Buffer.from(request.content, "utf-8").toString(
      "base64",
    );
    return octokit.rest.repos.createOrUpdateFileContents({
      owner: request.owner,
      repo: request.repo,
      path: request.path,
      message: request.message,
      sha: request.sha,
      branch: request.branch,
      committer,
      author,
      content: contentBase64,
    });
  },
  documentation:
    'Proxy behavior: this endpoint accepts plaintext `content` and base64-encodes it before forwarding to GitHub. Pass `stringifiedCommitter` and `stringifiedAuthor` as JSON strings; the proxy parses them before forwarding the request.\n\n# Create or update file contents\n\n**GitHub App permission: Contents (write)**\n\nCreates a new file or replaces an existing file in a repository.\n\n [!NOTE]\n If you use this endpoint and the "[Delete a file](https://docs.github.com/rest/repos/contents/#delete-a-file)" endpoint in parallel, the concurrent requests will conflict and you will receive errors. You must use these endpoints serially instead.\n\n```js\noctokit.rest.repos.createOrUpdateFileContents({\n  owner,\n  repo,\n  path,\n  message,\n  content,\n  committer,\n  author,\n});\n\n// Proxy request body\n{\n  "actionName": "github.repos.createOrUpdateFileContents",\n  "owner": "acme",\n  "repo": "monorepo",\n  "path": "README.md",\n  "message": "update README",\n  "content": "hello from the proxy",\n  "stringifiedCommitter": "{\\"name\\":\\"Acme Bot\\",\\"email\\":\\"bot@example.com\\"}"\n}\n```\n\n## Parameters\n\ntable\n  thead\n    tr\n      thname/th\n      threquired/th\n      thdescription/th\n    /tr\n  /thead\n  tbody\n    trtdowner/tdtdyes/tdtd\n\nThe account owner of the repository. The name is not case sensitive.\n\n/td/tr\ntrtdrepo/tdtdyes/tdtd\n\nThe name of the repository without the `.git` extension. The name is not case sensitive.\n\n/td/tr\ntrtdpath/tdtdyes/tdtd\n\npath parameter\n\n/td/tr\ntrtdmessage/tdtdyes/tdtd\n\nThe commit message.\n\n/td/tr\ntrtdcontent/tdtdyes/tdtd\n\nThe new file content in plaintext. This proxy encodes it to Base64 before forwarding to GitHub.\n\n/td/tr\ntrtdsha/tdtdno/tdtd\n\n**Required if you are updating a file**. The blob SHA of the file being replaced.\n\n/td/tr\ntrtdbranch/tdtdno/tdtd\n\nThe branch name. Default: the repository’s default branch.\n\n/td/tr\ntrtdstringifiedCommitter/tdtdno/tdtd\n\nA JSON string encoding the `committer` object.\n\n/td/tr\ntrtdstringifiedAuthor/tdtdno/tdtd\n\nA JSON string encoding the `author` object.\n\n/td/tr\n  /tbody\n/table\n\nSee also: [GitHub Developer Guide documentation](https://docs.github.com/rest/repos/contents#create-or-update-file-contents).',
};
