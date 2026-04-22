import { z } from "zod/v4";
import { baseRequestSchema, type EndpointObject } from "../endpointTypes.js";
import { getInstallationOctokit } from "../octokit.js";

const requestSchema = baseRequestSchema.extend({
  actionName: z.literal("github.git.getBlob"),
  owner: z.string(),
  repo: z.string(),
  file_sha: z.string(),
});

export const endpoint: EndpointObject<typeof requestSchema> = {
  requestSchema,
  executeRequest: async (request) => {
    const octokit = await getInstallationOctokit(request.owner, request.repo);
    const { actionName: _actionName, ...params } = request;
    return octokit.rest.git.getBlob(params);
  },
  documentation: "# Get a blob\n\n**GitHub App permission: Contents (read)**\n\nThe `content` in the response will always be Base64 encoded.\n\nThis endpoint supports the following custom media types. For more information, see \"[Media types](https://docs.github.com/rest/using-the-rest-api/getting-started-with-the-rest-api#media-types).\"\n\n- **`application/vnd.github.raw+json`**: Returns the raw blob data.\n- **`application/vnd.github+json`**: Returns a JSON representation of the blob with `content` as a base64 encoded string. This is the default if no media type is specified.\n\n**Note** This endpoint supports blobs up to 100 megabytes in size.\n\n```js\noctokit.rest.git.getBlob({\n  owner,\n  repo,\n  file_sha,\n});\n```\n\n## Parameters\n\ntable\n  thead\n    tr\n      thname/th\n      threquired/th\n      thdescription/th\n    /tr\n  /thead\n  tbody\n    trtdowner/tdtdyes/tdtd\n\nThe account owner of the repository. The name is not case sensitive.\n\n/td/tr\ntrtdrepo/tdtdyes/tdtd\n\nThe name of the repository without the `.git` extension. The name is not case sensitive.\n\n/td/tr\ntrtdfile_sha/tdtdyes/tdtd\n\n/td/tr\n  /tbody\n/table\n\nSee also: [GitHub Developer Guide documentation](https://docs.github.com/rest/git/blobs#get-a-blob).",
};
