import { z } from "zod/v4";
import { baseRequestSchema, type EndpointObject } from "../endpointTypes.js";
import { getInstallationOctokit } from "../octokit.js";

const requestSchema = baseRequestSchema.extend({
  actionName: z.literal("github.issues.list"),
  owner: z.string(),
  repo: z.string(),
  milestone: z.union([z.number().int(), z.literal("*"), z.literal("none")]).optional(),
  state: z.enum(["open", "closed", "all"]).optional(),
  assignee: z.string().optional(),
  type: z.string().optional(),
  creator: z.string().optional(),
  mentioned: z.string().optional(),
  labels: z.string().optional(),
  sort: z.enum(["created", "updated", "comments"]).optional(),
  direction: z.enum(["asc", "desc"]).optional(),
  since: z.string().optional(),
  per_page: z.number().int().min(1).max(100).optional(),
  page: z.number().int().min(1).optional(),
});

export const endpoint: EndpointObject<typeof requestSchema> = {
  requestSchema,
  executeRequest: async (request) => {
    const octokit = await getInstallationOctokit(request.owner, request.repo);
    const { actionName: _actionName, ...params } = request;
    const { data } = await octokit.rest.issues.listForRepo({
      ...params,
      milestone:
        typeof params.milestone === "number"
          ? String(params.milestone)
          : params.milestone,
    });
    return data;
  },
  documentation: "Proxy behavior: if `milestone` is a number, this endpoint stringifies it before forwarding to GitHub.\n\n# List repository issues\n\n**GitHub App permission: Issues (read)**\n\nList issues in a repository. Only open issues will be listed.\n\n [!NOTE]\n GitHub's REST API considers every pull request an issue, but not every issue is a pull request. For this reason, \"Issues\" endpoints may return both issues and pull requests in the response. You can identify pull requests by the `pull_request` key. Be aware that the `id` of a pull request returned from \"Issues\" endpoints will be an _issue id_. To find out the pull request id, use the \"[List pull requests](https://docs.github.com/rest/pulls/pulls#list-pull-requests)\" endpoint.\n\nThis endpoint supports the following custom media types. For more information, see \"[Media types](https://docs.github.com/rest/using-the-rest-api/getting-started-with-the-rest-api#media-types).\"\n\n- **`application/vnd.github.raw+json`**: Returns the raw markdown body. Response will include `body`. This is the default if you do not pass any specific media type.\n- **`application/vnd.github.text+json`**: Returns a text only representation of the markdown body. Response will include `body_text`.\n- **`application/vnd.github.html+json`**: Returns HTML rendered from the body's markdown. Response will include `body_html`.\n- **`application/vnd.github.full+json`**: Returns raw, text, and HTML representations. Response will include `body`, `body_text`, and `body_html`.\n\n```js\noctokit.rest.issues.listForRepo({\n  owner,\n  repo,\n});\n```\n\n## Parameters\n\ntable\n  thead\n    tr\n      thname/th\n      threquired/th\n      thdescription/th\n    /tr\n  /thead\n  tbody\n    trtdowner/tdtdyes/tdtd\n\nThe account owner of the repository. The name is not case sensitive.\n\n/td/tr\ntrtdrepo/tdtdyes/tdtd\n\nThe name of the repository without the `.git` extension. The name is not case sensitive.\n\n/td/tr\ntrtdmilestone/tdtdno/tdtd\n\nIf an `integer` is passed, it should refer to a milestone by its `number` field. If the string `*` is passed, issues with any milestone are accepted. If the string `none` is passed, issues without milestones are returned.\n\n/td/tr\ntrtdstate/tdtdno/tdtd\n\nIndicates the state of the issues to return.\n\n/td/tr\ntrtdassignee/tdtdno/tdtd\n\nCan be the name of a user. Pass in `none` for issues with no assigned user, and `*` for issues assigned to any user.\n\n/td/tr\ntrtdtype/tdtdno/tdtd\n\nCan be the name of an issue type. If the string `*` is passed, issues with any type are accepted. If the string `none` is passed, issues without type are returned.\n\n/td/tr\ntrtdcreator/tdtdno/tdtd\n\nThe user that created the issue.\n\n/td/tr\ntrtdmentioned/tdtdno/tdtd\n\nA user that's mentioned in the issue.\n\n/td/tr\ntrtdlabels/tdtdno/tdtd\n\nA list of comma separated label names. Example: `bug,ui,@high`\n\n/td/tr\ntrtdsort/tdtdno/tdtd\n\nWhat to sort results by.\n\n/td/tr\ntrtddirection/tdtdno/tdtd\n\nThe direction to sort the results by.\n\n/td/tr\ntrtdsince/tdtdno/tdtd\n\nOnly show results that were last updated after the given time. This is a timestamp in [ISO 8601](https://en.wikipedia.org/wiki/ISO_8601) format: `YYYY-MM-DDTHH:MM:SSZ`.\n\n/td/tr\ntrtdper_page/tdtdno/tdtd\n\nThe number of results per page (max 100). For more information, see \"[Using pagination in the REST API](https://docs.github.com/rest/using-the-rest-api/using-pagination-in-the-rest-api).\"\n\n/td/tr\ntrtdpage/tdtdno/tdtd\n\nThe page number of the results to fetch. For more information, see \"[Using pagination in the REST API](https://docs.github.com/rest/using-the-rest-api/using-pagination-in-the-rest-api).\"\n\n/td/tr\n  /tbody\n/table\n\nSee also: [GitHub Developer Guide documentation](https://docs.github.com/rest/issues/issues#list-repository-issues).",
};
