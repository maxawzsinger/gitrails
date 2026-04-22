import { z } from "zod/v4";
import { baseRequestSchema, type EndpointObject } from "../endpointTypes.js";
import { getInstallationOctokit } from "../octokit.js";
import { parseStringifiedJson } from "../stringifiedJson.js";

const treeItem = z.object({
  path: z.string().optional(),
  mode: z.enum(["100644", "100755", "040000", "160000", "120000"]).optional(),
  type: z.enum(["blob", "tree", "commit"]).optional(),
  sha: z.string().nullable().optional(),
  content: z.string().optional(),
});

const treeSchema = z.array(treeItem);

const requestSchema = baseRequestSchema.extend({
  actionName: z.literal("github.git.createTree"),
  owner: z.string(),
  repo: z.string(),
  stringifiedTree: z.string(),
  base_tree: z.string().optional(),
});

export const endpoint: EndpointObject<typeof requestSchema> = {
  requestSchema,
  executeRequest: async (request) => {
    const octokit = await getInstallationOctokit(request.owner, request.repo);
    const tree = parseStringifiedJson(request.stringifiedTree, "stringifiedTree", treeSchema);
    return octokit.rest.git.createTree({
      owner: request.owner,
      repo: request.repo,
      tree,
      base_tree: request.base_tree,
    });
  },
  documentation: "Proxy behavior: pass `stringifiedTree` as a JSON string. The proxy parses it into the `tree` array before forwarding the request to GitHub.\n\n# Create a tree\n\n**GitHub App permission: Contents (write)**\n\nThe tree creation API accepts nested entries. If you specify both a tree and a nested path modifying that tree, this endpoint will overwrite the contents of the tree with the new path contents, and create a new tree structure.\n\nIf you use this endpoint to add, delete, or modify the file contents in a tree, you will need to commit the tree and then update a branch to point to the commit. For more information see \"[Create a commit](https://docs.github.com/rest/git/commits#create-a-commit)\" and \"[Update a reference](https://docs.github.com/rest/git/refs#update-a-reference).\"\n\nReturns an error if you try to delete a file that does not exist.\n\n```js\noctokit.rest.git.createTree({\n  owner,\n  repo,\n  tree,\n});\n\n// Proxy request body\n{\n  \"actionName\": \"github.git.createTree\",\n  \"owner\": \"acme\",\n  \"repo\": \"monorepo\",\n  \"stringifiedTree\": \"[{\\\"path\\\":\\\"file.txt\\\",\\\"mode\\\":\\\"100644\\\",\\\"type\\\":\\\"blob\\\",\\\"sha\\\":\\\"abc123\\\"}]\"\n}\n```\n\n## Parameters\n\ntable\n  thead\n    tr\n      thname/th\n      threquired/th\n      thdescription/th\n    /tr\n  /thead\n  tbody\n    trtdowner/tdtdyes/tdtd\n\nThe account owner of the repository. The name is not case sensitive.\n\n/td/tr\ntrtdrepo/tdtdyes/tdtd\n\nThe name of the repository without the `.git` extension. The name is not case sensitive.\n\n/td/tr\ntrtdstringifiedTree/tdtdyes/tdtd\n\nA JSON string encoding the `tree` array. Each item may contain `path`, `mode`, `type`, `sha`, and `content`.\n\n/td/tr\ntrtdbase_tree/tdtdno/tdtd\n\nThe SHA1 of an existing Git tree object which will be used as the base for the new tree. If provided, a new Git tree object will be created from entries in the Git tree object pointed to by `base_tree` and entries defined in the `tree` parameter. Entries defined in the `tree` parameter will overwrite items from `base_tree` with the same `path`. If you're creating new changes on a branch, then normally you'd set `base_tree` to the SHA1 of the Git tree object of the current latest commit on the branch you're working on.\nIf not provided, GitHub will create a new Git tree object from only the entries defined in the `tree` parameter. If you create a new commit pointing to such a tree, then all files which were a part of the parent commit's tree and were not defined in the `tree` parameter will be listed as deleted by the new commit.\n\n/td/tr\n  /tbody\n/table\n\nSee also: [GitHub Developer Guide documentation](https://docs.github.com/rest/git/trees#create-a-tree).",
};
