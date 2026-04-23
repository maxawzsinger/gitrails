import { z } from "zod/v4";
import { baseRequestSchema, type EndpointObject } from "../endpointTypes.js";
import { getInstallationOctokit } from "../octokit.js";

const requestSchema = baseRequestSchema.extend({
  actionName: z.literal("github.pulls.list"),
  owner: z.string(),
  repo: z.string(),
  state: z.enum(["open", "closed", "all"]).optional(),
  head: z.string().optional(),
  base: z.string().optional(),
  sort: z.enum(["created", "updated", "popularity", "long-running"]).optional(),
  direction: z.enum(["asc", "desc"]).optional(),
  per_page: z.number().int().min(1).max(100).optional(),
  page: z.number().int().min(1).optional(),
});

export const endpoint: EndpointObject<typeof requestSchema> = {
  requestSchema,
  executeRequest: async (request) => {
    const octokit = await getInstallationOctokit(request.owner, request.repo);
    const { actionName: _actionName, ...params } = request;
    return octokit.rest.pulls.list(params);
  },
  documentation:
    '# List pull requests\n\n**GitHub App permission: Pull requests (read)**\n\nLists pull requests in a specified repository.\n\nDraft pull requests are available in public repositories with GitHub\nFree and GitHub Free for organizations, GitHub Pro, and legacy per-repository billing\nplans, and in public and private repositories with GitHub Team and GitHub Enterprise\nCloud. For more information, see [GitHub\'s products](https://docs.github.com/github/getting-started-with-github/githubs-products)\nin the GitHub Help documentation.\n\nThis endpoint supports the following custom media types. For more information, see "[Media types](https://docs.github.com/rest/using-the-rest-api/getting-started-with-the-rest-api#media-types)."\n\n- **`application/vnd.github.raw+json`**: Returns the raw markdown body. Response will include `body`. This is the default if you do not pass any specific media type.\n- **`application/vnd.github.text+json`**: Returns a text only representation of the markdown body. Response will include `body_text`.\n- **`application/vnd.github.html+json`**: Returns HTML rendered from the body\'s markdown. Response will include `body_html`.\n- **`application/vnd.github.full+json`**: Returns raw, text, and HTML representations. Response will include `body`, `body_text`, and `body_html`.\n\n```js\noctokit.rest.pulls.list({\n  owner,\n  repo,\n});\n```\n\n## Parameters\n\ntable\n  thead\n    tr\n      thname/th\n      threquired/th\n      thdescription/th\n    /tr\n  /thead\n  tbody\n    trtdowner/tdtdyes/tdtd\n\nThe account owner of the repository. The name is not case sensitive.\n\n/td/tr\ntrtdrepo/tdtdyes/tdtd\n\nThe name of the repository without the `.git` extension. The name is not case sensitive.\n\n/td/tr\ntrtdstate/tdtdno/tdtd\n\nEither `open`, `closed`, or `all` to filter by state.\n\n/td/tr\ntrtdhead/tdtdno/tdtd\n\nFilter pulls by head user or head organization and branch name in the format of `user:ref-name` or `organization:ref-name`. For example: `github:new-script-format` or `octocat:test-branch`.\n\n/td/tr\ntrtdbase/tdtdno/tdtd\n\nFilter pulls by base branch name. Example: `gh-pages`.\n\n/td/tr\ntrtdsort/tdtdno/tdtd\n\nWhat to sort results by. `popularity` will sort by the number of comments. `long-running` will sort by date created and will limit the results to pull requests that have been open for more than a month and have had activity within the past month.\n\n/td/tr\ntrtddirection/tdtdno/tdtd\n\nThe direction of the sort. Default: `desc` when sort is `created` or sort is not specified, otherwise `asc`.\n\n/td/tr\ntrtdper_page/tdtdno/tdtd\n\nThe number of results per page (max 100). For more information, see "[Using pagination in the REST API](https://docs.github.com/rest/using-the-rest-api/using-pagination-in-the-rest-api)."\n\n/td/tr\ntrtdpage/tdtdno/tdtd\n\nThe page number of the results to fetch. For more information, see "[Using pagination in the REST API](https://docs.github.com/rest/using-the-rest-api/using-pagination-in-the-rest-api)."\n\n/td/tr\n  /tbody\n/table\n\nSee also: [GitHub Developer Guide documentation](https://docs.github.com/rest/pulls/pulls#list-pull-requests).',
};
