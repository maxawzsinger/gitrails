import { z } from "zod/v4";
import { baseRequestSchema, type EndpointObject } from "../endpointTypes.js";
import { getInstallationOctokit } from "../octokit.js";

const requestSchema = baseRequestSchema.extend({
  actionName: z.literal("github.git.getTree"),
  owner: z.string(),
  repo: z.string(),
  tree_sha: z.string(),
  recursive: z.string().optional(),
});

export const endpoint: EndpointObject<typeof requestSchema> = {
  requestSchema,
  executeRequest: async (request) => {
    const octokit = await getInstallationOctokit(request.owner, request.repo);
    const { actionName: _actionName, ...params } = request;
    const { data } = await octokit.rest.git.getTree(params);
    return data;
  },
  documentation: "# Get a tree\n\n**GitHub App permission: Contents (read)**\n\nReturns a single tree using the SHA1 value or ref name for that tree.\n\nIf `truncated` is `true` in the response then the number of items in the `tree` array exceeded our maximum limit. If you need to fetch more items, use the non-recursive method of fetching trees, and fetch one sub-tree at a time.\n\n [!NOTE]\n The limit for the `tree` array is 100,000 entries with a maximum size of 7 MB when using the `recursive` parameter.\n\n```js\noctokit.rest.git.getTree({\n  owner,\n  repo,\n  tree_sha,\n});\n```\n\n## Parameters\n\ntable\n  thead\n    tr\n      thname/th\n      threquired/th\n      thdescription/th\n    /tr\n  /thead\n  tbody\n    trtdowner/tdtdyes/tdtd\n\nThe account owner of the repository. The name is not case sensitive.\n\n/td/tr\ntrtdrepo/tdtdyes/tdtd\n\nThe name of the repository without the `.git` extension. The name is not case sensitive.\n\n/td/tr\ntrtdtree_sha/tdtdyes/tdtd\n\nThe SHA1 value or ref (branch or tag) name of the tree.\n\n/td/tr\ntrtdrecursive/tdtdno/tdtd\n\nSetting this parameter to any value returns the objects or subtrees referenced by the tree specified in `:tree_sha`. For example, setting `recursive` to any of the following will enable returning objects or subtrees: `0`, `1`, `\"true\"`, and `\"false\"`. Omit this parameter to prevent recursively returning objects or subtrees.\n\n/td/tr\n  /tbody\n/table\n\nSee also: [GitHub Developer Guide documentation](https://docs.github.com/rest/git/trees#get-a-tree).",
};
