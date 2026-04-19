import { z } from "zod/v4";
import { baseRequestSchema, type EndpointObject } from "../endpointTypes.js";
import { getInstallationOctokit } from "../octokit.js";

const treeItem = z.object({
  path: z.string().optional(),
  mode: z.enum(["100644", "100755", "040000", "160000", "120000"]).optional(),
  type: z.enum(["blob", "tree", "commit"]).optional(),
  sha: z.string().nullable().optional(),
  content: z.string().optional(),
});

const requestSchema = baseRequestSchema.extend({
  actionName: z.literal("github.git.createTree"),
  owner: z.string(),
  repo: z.string(),
  tree: z.array(treeItem),
  base_tree: z.string().optional(),
});

export const endpoint: EndpointObject<typeof requestSchema> = {
  requestSchema,
  executeRequest: async (request) => {
    const octokit = await getInstallationOctokit(request.owner, request.repo);
    const { actionName: _actionName, ...params } = request;
    const { data } = await octokit.rest.git.createTree(params);
    return data;
  },
  documentation: "# Create a tree\n\n**GitHub App permission: Contents (write)**\n\nThe tree creation API accepts nested entries. If you specify both a tree and a nested path modifying that tree, this endpoint will overwrite the contents of the tree with the new path contents, and create a new tree structure.\n\nIf you use this endpoint to add, delete, or modify the file contents in a tree, you will need to commit the tree and then update a branch to point to the commit. For more information see \"[Create a commit](https://docs.github.com/rest/git/commits#create-a-commit)\" and \"[Update a reference](https://docs.github.com/rest/git/refs#update-a-reference).\"\n\nReturns an error if you try to delete a file that does not exist.\n\n```js\noctokit.rest.git.createTree({\n  owner,\n  repo,\n  tree,\n});\n```\n\n## Parameters\n\ntable\n  thead\n    tr\n      thname/th\n      threquired/th\n      thdescription/th\n    /tr\n  /thead\n  tbody\n    trtdowner/tdtdyes/tdtd\n\nThe account owner of the repository. The name is not case sensitive.\n\n/td/tr\ntrtdrepo/tdtdyes/tdtd\n\nThe name of the repository without the `.git` extension. The name is not case sensitive.\n\n/td/tr\ntrtdtree/tdtdyes/tdtd\n\nObjects (of `path`, `mode`, `type`, and `sha`) specifying a tree structure.\n\n/td/tr\ntrtdtree[].path/tdtdno/tdtd\n\nThe file referenced in the tree.\n\n/td/tr\ntrtdtree[].mode/tdtdno/tdtd\n\nThe file mode; one of `100644` for file (blob), `100755` for executable (blob), `040000` for subdirectory (tree), `160000` for submodule (commit), or `120000` for a blob that specifies the path of a symlink.\n\n/td/tr\ntrtdtree[].type/tdtdno/tdtd\n\nEither `blob`, `tree`, or `commit`.\n\n/td/tr\ntrtdtree[].sha/tdtdno/tdtd\n\nThe SHA1 checksum ID of the object in the tree. Also called `tree.sha`. If the value is `null` then the file will be deleted.\n\n**Note:** Use either `tree.sha` or `content` to specify the contents of the entry. Using both `tree.sha` and `content` will return an error.\n\n/td/tr\ntrtdtree[].content/tdtdno/tdtd\n\nThe content you want this file to have. GitHub will write this blob out and use that SHA for this entry. Use either this, or `tree.sha`.\n\n**Note:** Use either `tree.sha` or `content` to specify the contents of the entry. Using both `tree.sha` and `content` will return an error.\n\n/td/tr\ntrtdbase_tree/tdtdno/tdtd\n\nThe SHA1 of an existing Git tree object which will be used as the base for the new tree. If provided, a new Git tree object will be created from entries in the Git tree object pointed to by `base_tree` and entries defined in the `tree` parameter. Entries defined in the `tree` parameter will overwrite items from `base_tree` with the same `path`. If you're creating new changes on a branch, then normally you'd set `base_tree` to the SHA1 of the Git tree object of the current latest commit on the branch you're working on.\nIf not provided, GitHub will create a new Git tree object from only the entries defined in the `tree` parameter. If you create a new commit pointing to such a tree, then all files which were a part of the parent commit's tree and were not defined in the `tree` parameter will be listed as deleted by the new commit.\n\n/td/tr\n  /tbody\n/table\n\nSee also: [GitHub Developer Guide documentation](https://docs.github.com/rest/git/trees#create-a-tree).",
};
