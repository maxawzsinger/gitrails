import { z } from "zod/v4";
import { baseRequestSchema, type EndpointObject } from "../endpointTypes.js";
import { getInstallationOctokit } from "../octokit.js";

const requestSchema = baseRequestSchema.extend({
  actionName: z.literal("github.pulls.update"),
  owner: z.string(),
  repo: z.string(),
  pull_number: z.number().int(),
  title: z.string().optional(),
  body: z.string().optional(),
  state: z.enum(["open", "closed"]).optional(),
  base: z.string().optional(),
  maintainer_can_modify: z.boolean().optional(),
});

export const endpoint: EndpointObject<typeof requestSchema> = {
  requestSchema,
  executeRequest: async (request) => {
    const octokit = await getInstallationOctokit(request.owner, request.repo);
    const { actionName: _actionName, ...params } = request;
    return octokit.rest.pulls.update(params);
  },
  documentation: "# Update a pull request\n\n**GitHub App permission: Pull requests (write)**\n\nDraft pull requests are available in public repositories with GitHub Free and GitHub Free for organizations, GitHub Pro, and legacy per-repository billing plans, and in public and private repositories with GitHub Team and GitHub Enterprise Cloud. For more information, see [GitHub's products](https://docs.github.com/github/getting-started-with-github/githubs-products) in the GitHub Help documentation.\n\nTo open or update a pull request in a public repository, you must have write access to the head or the source branch. For organization-owned repositories, you must be a member of the organization that owns the repository to open or update a pull request.\n\nThis endpoint supports the following custom media types. For more information, see \"[Media types](https://docs.github.com/rest/using-the-rest-api/getting-started-with-the-rest-api#media-types).\"\n\n- **`application/vnd.github.raw+json`**: Returns the raw markdown body. Response will include `body`. This is the default if you do not pass any specific media type.\n- **`application/vnd.github.text+json`**: Returns a text only representation of the markdown body. Response will include `body_text`.\n- **`application/vnd.github.html+json`**: Returns HTML rendered from the body's markdown. Response will include `body_html`.\n- **`application/vnd.github.full+json`**: Returns raw, text, and HTML representations. Response will include `body`, `body_text`, and `body_html`.\n\n```js\noctokit.rest.pulls.update({\n  owner,\n  repo,\n  pull_number,\n});\n```\n\n## Parameters\n\ntable\n  thead\n    tr\n      thname/th\n      threquired/th\n      thdescription/th\n    /tr\n  /thead\n  tbody\n    trtdowner/tdtdyes/tdtd\n\nThe account owner of the repository. The name is not case sensitive.\n\n/td/tr\ntrtdrepo/tdtdyes/tdtd\n\nThe name of the repository without the `.git` extension. The name is not case sensitive.\n\n/td/tr\ntrtdpull_number/tdtdyes/tdtd\n\nThe number that identifies the pull request.\n\n/td/tr\ntrtdtitle/tdtdno/tdtd\n\nThe title of the pull request.\n\n/td/tr\ntrtdbody/tdtdno/tdtd\n\nThe contents of the pull request.\n\n/td/tr\ntrtdstate/tdtdno/tdtd\n\nState of this Pull Request. Either `open` or `closed`.\n\n/td/tr\ntrtdbase/tdtdno/tdtd\n\nThe name of the branch you want your changes pulled into. This should be an existing branch on the current repository. You cannot update the base branch on a pull request to point to another repository.\n\n/td/tr\ntrtdmaintainer_can_modify/tdtdno/tdtd\n\nIndicates whether [maintainers can modify](https://docs.github.com/articles/allowing-changes-to-a-pull-request-branch-created-from-a-fork/) the pull request.\n\n/td/tr\n  /tbody\n/table\n\nSee also: [GitHub Developer Guide documentation](https://docs.github.com/rest/pulls/pulls#update-a-pull-request).",
};
