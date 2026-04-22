import { z } from "zod/v4";
import { baseRequestSchema, type EndpointObject } from "../endpointTypes.js";
import { getInstallationOctokit } from "../octokit.js";
import { parseStringifiedJson } from "../stringifiedJson.js";

const labelsSchema = z.array(z.string());
const assigneesSchema = z.array(z.string());

const requestSchema = baseRequestSchema.extend({
  actionName: z.literal("github.issues.create"),
  owner: z.string(),
  repo: z.string(),
  title: z.string(),
  body: z.string().optional(),
  assignee: z.string().optional(),
  milestone: z.number().int().optional(),
  stringifiedLabels: z.string().optional(),
  stringifiedAssignees: z.string().optional(),
  type: z.string().optional(),
});

export const endpoint: EndpointObject<typeof requestSchema> = {
  requestSchema,
  executeRequest: async (request) => {
    const octokit = await getInstallationOctokit(request.owner, request.repo);
    const labels = request.stringifiedLabels
      ? parseStringifiedJson(request.stringifiedLabels, "stringifiedLabels", labelsSchema)
      : undefined;
    const assignees = request.stringifiedAssignees
      ? parseStringifiedJson(
          request.stringifiedAssignees,
          "stringifiedAssignees",
          assigneesSchema,
        )
      : undefined;
    const { data } = await octokit.rest.issues.create({
      owner: request.owner,
      repo: request.repo,
      title: request.title,
      body: request.body,
      assignee: request.assignee,
      milestone: request.milestone,
      labels,
      assignees,
      type: request.type,
    });
    return data;
  },
  documentation: "Proxy behavior: pass `stringifiedLabels` and `stringifiedAssignees` as JSON strings. The proxy parses them before forwarding the request to GitHub.\n\n# Create an issue\n\n**GitHub App permission: Issues (write)**\n\nAny user with pull access to a repository can create an issue. If [issues are disabled in the repository](https://docs.github.com/articles/disabling-issues/), the API returns a `410 Gone` status.\n\nThis endpoint triggers [notifications](https://docs.github.com/github/managing-subscriptions-and-notifications-on-github/about-notifications). Creating content too quickly using this endpoint may result in secondary rate limiting. For more information, see \"[Rate limits for the API](https://docs.github.com/rest/using-the-rest-api/rate-limits-for-the-rest-api#about-secondary-rate-limits)\"\nand \"[Best practices for using the REST API](https://docs.github.com/rest/guides/best-practices-for-using-the-rest-api).\"\n\nThis endpoint supports the following custom media types. For more information, see \"[Media types](https://docs.github.com/rest/using-the-rest-api/getting-started-with-the-rest-api#media-types).\"\n\n- **`application/vnd.github.raw+json`**: Returns the raw markdown body. Response will include `body`. This is the default if you do not pass any specific media type.\n- **`application/vnd.github.text+json`**: Returns a text only representation of the markdown body. Response will include `body_text`.\n- **`application/vnd.github.html+json`**: Returns HTML rendered from the body's markdown. Response will include `body_html`.\n- **`application/vnd.github.full+json`**: Returns raw, text, and HTML representations. Response will include `body`, `body_text`, and `body_html`.\n\n```js\noctokit.rest.issues.create({\n  owner,\n  repo,\n  title,\n  labels,\n  assignees,\n});\n\n// Proxy request body\n{\n  \"actionName\": \"github.issues.create\",\n  \"owner\": \"acme\",\n  \"repo\": \"monorepo\",\n  \"title\": \"Bug report\",\n  \"stringifiedLabels\": \"[\\\"bug\\\",\\\"priority:high\\\"]\"\n}\n```\n\n## Parameters\n\ntable\n  thead\n    tr\n      thname/th\n      threquired/th\n      thdescription/th\n    /tr\n  /thead\n  tbody\n    trtdowner/tdtdyes/tdtd\n\nThe account owner of the repository. The name is not case sensitive.\n\n/td/tr\ntrtdrepo/tdtdyes/tdtd\n\nThe name of the repository without the `.git` extension. The name is not case sensitive.\n\n/td/tr\ntrtdtitle/tdtdyes/tdtd\n\nThe title of the issue.\n\n/td/tr\ntrtdbody/tdtdno/tdtd\n\nThe contents of the issue.\n\n/td/tr\ntrtdassignee/tdtdno/tdtd\n\nLogin for the user that this issue should be assigned to. _NOTE: Only users with push access can set the assignee for new issues. The assignee is silently dropped otherwise. **This field is closing down.**_\n\n/td/tr\ntrtdmilestone/tdtdno/tdtd\n\n/td/tr\ntrtdstringifiedLabels/tdtdno/tdtd\n\nA JSON string encoding the `labels` array.\n\n/td/tr\ntrtdstringifiedAssignees/tdtdno/tdtd\n\nA JSON string encoding the `assignees` array.\n\n/td/tr\ntrtdtype/tdtdno/tdtd\n\nThe name of the issue type to associate with this issue. _NOTE: Only users with push access can set the type for new issues. The type is silently dropped otherwise._\n\n/td/tr\n  /tbody\n/table\n\nSee also: [GitHub Developer Guide documentation](https://docs.github.com/rest/issues/issues#create-an-issue).",
};
