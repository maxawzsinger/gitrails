import { z } from "zod/v4";
import { baseRequestSchema, type EndpointObject } from "../endpointTypes.js";
import { getInstallationOctokit } from "../octokit.js";
import { parseStringifiedJson } from "../stringifiedJson.js";

const committerSchema = z.object({
  name: z.string().optional(),
  email: z.string().optional(),
});
const authorSchema = z.object({
  name: z.string().optional(),
  email: z.string().optional(),
});

const requestSchema = baseRequestSchema.extend({
  actionName: z.literal("github.repos.deleteFile"),
  owner: z.string(),
  repo: z.string(),
  path: z.string(),
  message: z.string(),
  sha: z.string(),
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
      ? parseStringifiedJson(request.stringifiedAuthor, "stringifiedAuthor", authorSchema)
      : undefined;
    const { data } = await octokit.rest.repos.deleteFile({
      owner: request.owner,
      repo: request.repo,
      path: request.path,
      message: request.message,
      sha: request.sha,
      branch: request.branch,
      committer,
      author,
    });
    return data;
  },
  documentation: "Proxy behavior: pass `stringifiedCommitter` and `stringifiedAuthor` as JSON strings. The proxy parses them before forwarding the request to GitHub.\n\n# Delete a file\n\n**GitHub App permission: Contents (write)**\n\nDeletes a file in a repository.\n\nYou can provide an additional `committer` parameter, which is an object containing information about the committer. Or, you can provide an `author` parameter, which is an object containing information about the author.\n\nThe `author` section is optional and is filled in with the `committer` information if omitted. If the `committer` information is omitted, the authenticated user's information is used.\n\nYou must provide values for both `name` and `email`, whether you choose to use `author` or `committer`. Otherwise, you'll receive a `422` status code.\n\n [!NOTE]\n If you use this endpoint and the \"[Create or update file contents](https://docs.github.com/rest/repos/contents/#create-or-update-file-contents)\" endpoint in parallel, the concurrent requests will conflict and you will receive errors. You must use these endpoints serially instead.\n\n```js\noctokit.rest.repos.deleteFile({\n  owner,\n  repo,\n  path,\n  message,\n  sha,\n  committer,\n  author,\n});\n\n// Proxy request body\n{\n  \"actionName\": \"github.repos.deleteFile\",\n  \"owner\": \"acme\",\n  \"repo\": \"monorepo\",\n  \"path\": \"README.md\",\n  \"message\": \"delete README\",\n  \"sha\": \"abc123\",\n  \"stringifiedCommitter\": \"{\\\"name\\\":\\\"Acme Bot\\\",\\\"email\\\":\\\"bot@example.com\\\"}\"\n}\n```\n\n## Parameters\n\ntable\n  thead\n    tr\n      thname/th\n      threquired/th\n      thdescription/th\n    /tr\n  /thead\n  tbody\n    trtdowner/tdtdyes/tdtd\n\nThe account owner of the repository. The name is not case sensitive.\n\n/td/tr\ntrtdrepo/tdtdyes/tdtd\n\nThe name of the repository without the `.git` extension. The name is not case sensitive.\n\n/td/tr\ntrtdpath/tdtdyes/tdtd\n\npath parameter\n\n/td/tr\ntrtdmessage/tdtdyes/tdtd\n\nThe commit message.\n\n/td/tr\ntrtdsha/tdtdyes/tdtd\n\nThe blob SHA of the file being deleted.\n\n/td/tr\ntrtdbranch/tdtdno/tdtd\n\nThe branch name. Default: the repository’s default branch\n\n/td/tr\ntrtdstringifiedCommitter/tdtdno/tdtd\n\nA JSON string encoding the `committer` object.\n\n/td/tr\ntrtdstringifiedAuthor/tdtdno/tdtd\n\nA JSON string encoding the `author` object.\n\n/td/tr\n  /tbody\n/table\n\nSee also: [GitHub Developer Guide documentation](https://docs.github.com/rest/repos/contents#delete-a-file).",
};
