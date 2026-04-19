import { z } from "zod/v4";
import { baseRequestSchema, type EndpointObject } from "../endpointTypes.js";
import { getInstallationOctokit } from "../octokit.js";

const requestSchema = baseRequestSchema.extend({
  actionName: z.literal("github.repos.createOrUpdateFileContents"),
  owner: z.string(),
  repo: z.string(),
  path: z.string(),
  message: z.string(),
  content: z.string(),
  sha: z.string().optional(),
  branch: z.string().optional(),
  committer: z
    .object({
      name: z.string(),
      email: z.string(),
      date: z.string().optional(),
    })
    .optional(),
  author: z
    .object({
      name: z.string(),
      email: z.string(),
      date: z.string().optional(),
    })
    .optional(),
});

export const endpoint: EndpointObject<typeof requestSchema> = {
  requestSchema,
  executeRequest: async (request) => {
    const octokit = await getInstallationOctokit(request.owner, request.repo);
    const { actionName: _actionName, ...params } = request;
    // API requires base64 content; accept plaintext and encode here
    const contentBase64 = Buffer.from(request.content, "utf-8").toString(
      "base64",
    );
    const { data } = await octokit.rest.repos.createOrUpdateFileContents({
      ...params,
      content: contentBase64,
    });
    return data;
  },
  documentation: "Proxy behavior: this endpoint accepts plaintext `content` and base64-encodes it before forwarding to GitHub.\n\n# Create or update file contents\n\n**GitHub App permission: Contents (write)**\n\nCreates a new file or replaces an existing file in a repository.\n\n [!NOTE]\n If you use this endpoint and the \"[Delete a file](https://docs.github.com/rest/repos/contents/#delete-a-file)\" endpoint in parallel, the concurrent requests will conflict and you will receive errors. You must use these endpoints serially instead.\n\n```js\noctokit.rest.repos.createOrUpdateFileContents({\n        owner,\nrepo,\npath,\nmessage,\ncontent,\ncommitter.name,\ncommitter.email,\nauthor.name,\nauthor.email\n      })\n```\n\n## Parameters\n\ntable\n  thead\n    tr\n      thname/th\n      threquired/th\n      thdescription/th\n    /tr\n  /thead\n  tbody\n    trtdowner/tdtdyes/tdtd\n\nThe account owner of the repository. The name is not case sensitive.\n\n/td/tr\ntrtdrepo/tdtdyes/tdtd\n\nThe name of the repository without the `.git` extension. The name is not case sensitive.\n\n/td/tr\ntrtdpath/tdtdyes/tdtd\n\npath parameter\n\n/td/tr\ntrtdmessage/tdtdyes/tdtd\n\nThe commit message.\n\n/td/tr\ntrtdcontent/tdtdyes/tdtd\n\nThe new file content in plaintext. This proxy encodes it to Base64 before forwarding to GitHub.\n\n/td/tr\ntrtdsha/tdtdno/tdtd\n\n**Required if you are updating a file**. The blob SHA of the file being replaced.\n\n/td/tr\ntrtdbranch/tdtdno/tdtd\n\nThe branch name. Default: the repository’s default branch.\n\n/td/tr\ntrtdcommitter/tdtdno/tdtd\n\nThe person that committed the file. Default: the authenticated user.\n\n/td/tr\ntrtdcommitter.name/tdtdyes/tdtd\n\nThe name of the author or committer of the commit. You'll receive a `422` status code if `name` is omitted.\n\n/td/tr\ntrtdcommitter.email/tdtdyes/tdtd\n\nThe email of the author or committer of the commit. You'll receive a `422` status code if `email` is omitted.\n\n/td/tr\ntrtdcommitter.date/tdtdno/tdtd\n\n/td/tr\ntrtdauthor/tdtdno/tdtd\n\nThe author of the file. Default: The `committer` or the authenticated user if you omit `committer`.\n\n/td/tr\ntrtdauthor.name/tdtdyes/tdtd\n\nThe name of the author or committer of the commit. You'll receive a `422` status code if `name` is omitted.\n\n/td/tr\ntrtdauthor.email/tdtdyes/tdtd\n\nThe email of the author or committer of the commit. You'll receive a `422` status code if `email` is omitted.\n\n/td/tr\ntrtdauthor.date/tdtdno/tdtd\n\n/td/tr\n  /tbody\n/table\n\nSee also: [GitHub Developer Guide documentation](https://docs.github.com/rest/repos/contents#create-or-update-file-contents).",
};
