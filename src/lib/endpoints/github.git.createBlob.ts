import { z } from "zod/v4";
import { baseRequestSchema, type EndpointObject } from "../endpointTypes.js";
import { getInstallationOctokit } from "../octokit.js";

const requestSchema = baseRequestSchema.extend({
  actionName: z.literal("github.git.createBlob"),
  owner: z.string(),
  repo: z.string(),
  content: z.string(),
  encoding: z.enum(["utf-8", "base64"]).optional(),
});

export const endpoint: EndpointObject<typeof requestSchema> = {
  requestSchema,
  executeRequest: async (request) => {
    const octokit = await getInstallationOctokit(request.owner, request.repo);
    const { actionName: _actionName, ...params } = request;
    return octokit.rest.git.createBlob(params);
  },
  documentation: "# Create a blob\n\n**GitHub App permission: Contents (write)**\n\n```js\noctokit.rest.git.createBlob({\n  owner,\n  repo,\n  content,\n});\n```\n\n## Parameters\n\ntable\n  thead\n    tr\n      thname/th\n      threquired/th\n      thdescription/th\n    /tr\n  /thead\n  tbody\n    trtdowner/tdtdyes/tdtd\n\nThe account owner of the repository. The name is not case sensitive.\n\n/td/tr\ntrtdrepo/tdtdyes/tdtd\n\nThe name of the repository without the `.git` extension. The name is not case sensitive.\n\n/td/tr\ntrtdcontent/tdtdyes/tdtd\n\nThe new blob's content.\n\n/td/tr\ntrtdencoding/tdtdno/tdtd\n\nThe encoding used for `content`. Currently, `\"utf-8\"` and `\"base64\"` are supported.\n\n/td/tr\n  /tbody\n/table\n\nSee also: [GitHub Developer Guide documentation](https://docs.github.com/rest/git/blobs#create-a-blob).",
};
