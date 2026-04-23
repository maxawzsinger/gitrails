import { z } from "zod/v4";
import { baseRequestSchema, type EndpointObject } from "../endpointTypes.js";
import { getInstallationOctokit } from "../octokit.js";

const requestSchema = baseRequestSchema.extend({
  actionName: z.literal("github.pulls.merge"),
  owner: z.string(),
  repo: z.string(),
  pull_number: z.number().int(),
  commit_title: z.string().optional(),
  commit_message: z.string().optional(),
  merge_method: z.enum(["merge", "squash", "rebase"]).optional(),
  sha: z.string().optional(),
});

export const endpoint: EndpointObject<typeof requestSchema> = {
  requestSchema,
  executeRequest: async (request) => {
    const octokit = await getInstallationOctokit(request.owner, request.repo);
    const { actionName: _actionName, ...params } = request;
    return octokit.rest.pulls.merge(params);
  },
  documentation:
    '# Merge a pull request\n\n**GitHub App permission: Contents (write)**\n\nMerges a pull request into the base branch.\nThis endpoint triggers [notifications](https://docs.github.com/github/managing-subscriptions-and-notifications-on-github/about-notifications). Creating content too quickly using this endpoint may result in secondary rate limiting. For more information, see "[Rate limits for the API](https://docs.github.com/rest/using-the-rest-api/rate-limits-for-the-rest-api#about-secondary-rate-limits)" and "[Best practices for using the REST API](https://docs.github.com/rest/guides/best-practices-for-using-the-rest-api)."\n\n```js\noctokit.rest.pulls.merge({\n  owner,\n  repo,\n  pull_number,\n});\n```\n\n## Parameters\n\ntable\n  thead\n    tr\n      thname/th\n      threquired/th\n      thdescription/th\n    /tr\n  /thead\n  tbody\n    trtdowner/tdtdyes/tdtd\n\nThe account owner of the repository. The name is not case sensitive.\n\n/td/tr\ntrtdrepo/tdtdyes/tdtd\n\nThe name of the repository without the `.git` extension. The name is not case sensitive.\n\n/td/tr\ntrtdpull_number/tdtdyes/tdtd\n\nThe number that identifies the pull request.\n\n/td/tr\ntrtdcommit_title/tdtdno/tdtd\n\nTitle for the automatic commit message.\n\n/td/tr\ntrtdcommit_message/tdtdno/tdtd\n\nExtra detail to append to automatic commit message.\n\n/td/tr\ntrtdsha/tdtdno/tdtd\n\nSHA that pull request head must match to allow merge.\n\n/td/tr\ntrtdmerge_method/tdtdno/tdtd\n\nThe merge method to use.\n\n/td/tr\n  /tbody\n/table\n\nSee also: [GitHub Developer Guide documentation](https://docs.github.com/rest/pulls/pulls#merge-a-pull-request).',
};
