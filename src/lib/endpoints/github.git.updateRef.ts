import { z } from "zod/v4";
import { baseRequestSchema, type EndpointObject } from "../endpointTypes.js";
import { getInstallationOctokit } from "../octokit.js";

const requestSchema = baseRequestSchema.extend({
  actionName: z.literal("github.git.updateRef"),
  owner: z.string(),
  repo: z.string(),
  ref: z.string(),
  sha: z.string(),
  force: z.boolean().optional(),
});

export const endpoint: EndpointObject<typeof requestSchema> = {
  requestSchema,
  executeRequest: async (request) => {
    const octokit = await getInstallationOctokit(request.owner, request.repo);
    const { actionName: _actionName, ...params } = request;
    return octokit.rest.git.updateRef(params);
  },
  documentation: "# Update a reference\n\n**GitHub App permission: Contents (write)**\n\nUpdates the provided reference to point to a new SHA. For more information, see \"[Git References](https://git-scm.com/book/en/v2/Git-Internals-Git-References)\" in the Git documentation.\n\n```js\noctokit.rest.git.updateRef({\n  owner,\n  repo,\n  ref,\n  sha,\n});\n```\n\n## Parameters\n\ntable\n  thead\n    tr\n      thname/th\n      threquired/th\n      thdescription/th\n    /tr\n  /thead\n  tbody\n    trtdowner/tdtdyes/tdtd\n\nThe account owner of the repository. The name is not case sensitive.\n\n/td/tr\ntrtdrepo/tdtdyes/tdtd\n\nThe name of the repository without the `.git` extension. The name is not case sensitive.\n\n/td/tr\ntrtdref/tdtdyes/tdtd\n\nThe Git reference. For more information, see \"[Git References](https://git-scm.com/book/en/v2/Git-Internals-Git-References)\" in the Git documentation.\n\n/td/tr\ntrtdsha/tdtdyes/tdtd\n\nThe SHA1 value to set this reference to\n\n/td/tr\ntrtdforce/tdtdno/tdtd\n\nIndicates whether to force the update or to make sure the update is a fast-forward update. Leaving this out or setting it to `false` will make sure you're not overwriting work.\n\n/td/tr\n  /tbody\n/table\n\nSee also: [GitHub Developer Guide documentation](https://docs.github.com/rest/git/refs#update-a-reference).",
};
