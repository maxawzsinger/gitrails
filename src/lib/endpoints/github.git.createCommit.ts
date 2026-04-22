import { z } from "zod/v4";
import { baseRequestSchema, type EndpointObject } from "../endpointTypes.js";
import { getInstallationOctokit } from "../octokit.js";
import { parseStringifiedJson } from "../stringifiedJson.js";

const parentsSchema = z.array(z.string());
const authorSchema = z.object({
  name: z.string(),
  email: z.string(),
  date: z.string().optional(),
});
const committerSchema = z.object({
  name: z.string().optional(),
  email: z.string().optional(),
  date: z.string().optional(),
});

const requestSchema = baseRequestSchema.extend({
  actionName: z.literal("github.git.createCommit"),
  owner: z.string(),
  repo: z.string(),
  message: z.string(),
  tree: z.string(),
  stringifiedParents: z.string().optional(),
  stringifiedAuthor: z.string().optional(),
  stringifiedCommitter: z.string().optional(),
  signature: z.string().optional(),
});

export const endpoint: EndpointObject<typeof requestSchema> = {
  requestSchema,
  executeRequest: async (request) => {
    const octokit = await getInstallationOctokit(request.owner, request.repo);
    const parents = request.stringifiedParents
      ? parseStringifiedJson(request.stringifiedParents, "stringifiedParents", parentsSchema)
      : undefined;
    const author = request.stringifiedAuthor
      ? parseStringifiedJson(request.stringifiedAuthor, "stringifiedAuthor", authorSchema)
      : undefined;
    const committer = request.stringifiedCommitter
      ? parseStringifiedJson(
          request.stringifiedCommitter,
          "stringifiedCommitter",
          committerSchema,
        )
      : undefined;
    const { data } = await octokit.rest.git.createCommit({
      owner: request.owner,
      repo: request.repo,
      message: request.message,
      tree: request.tree,
      parents,
      author,
      committer,
      signature: request.signature,
    });
    return data;
  },
  documentation: "Proxy behavior: pass `stringifiedParents`, `stringifiedAuthor`, and `stringifiedCommitter` as JSON strings. The proxy parses them before forwarding the request to GitHub.\n\n# Create a commit\n\n**GitHub App permission: Contents (write)**\n\nCreates a new Git [commit object](https://git-scm.com/book/en/v2/Git-Internals-Git-Objects).\n\n**Signature verification object**\n\nThe response will include a `verification` object that describes the result of verifying the commit's signature. The following fields are included in the `verification` object:\n\n| Name          | Type      | Description                                                                                          |\n| ------------- | --------- | ---------------------------------------------------------------------------------------------------- |\n| `verified`    | `boolean` | Indicates whether GitHub considers the signature in this commit to be verified.                      |\n| `reason`      | `string`  | The reason for verified value. Possible values and their meanings are enumerated in the table below. |\n| `signature`   | `string`  | The signature that was extracted from the commit.                                                    |\n| `payload`     | `string`  | The value that was signed.                                                                           |\n| `verified_at` | `string`  | The date the signature was verified by GitHub.                                                       |\n\nThese are the possible values for `reason` in the `verification` object:\n\n| Value                    | Description                                                                                                                     |\n| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |\n| `expired_key`            | The key that made the signature is expired.                                                                                     |\n| `not_signing_key`        | The \"signing\" flag is not among the usage flags in the GPG key that made the signature.                                         |\n| `gpgverify_error`        | There was an error communicating with the signature verification service.                                                       |\n| `gpgverify_unavailable`  | The signature verification service is currently unavailable.                                                                    |\n| `unsigned`               | The object does not include a signature.                                                                                        |\n| `unknown_signature_type` | A non-PGP signature was found in the commit.                                                                                    |\n| `no_user`                | No user was associated with the `committer` email address in the commit.                                                        |\n| `unverified_email`       | The `committer` email address in the commit was associated with a user, but the email address is not verified on their account. |\n| `bad_email`              | The `committer` email address in the commit is not included in the identities of the PGP key that made the signature.           |\n| `unknown_key`            | The key that made the signature has not been registered with any user's account.                                                |\n| `malformed_signature`    | There was an error parsing the signature.                                                                                       |\n| `invalid`                | The signature could not be cryptographically verified using the key whose key-id was found in the signature.                    |\n| `valid`                  | None of the above errors applied, so the signature is considered to be verified.                                                |\n\n```js\noctokit.rest.git.createCommit({\n  owner,\n  repo,\n  message,\n  tree,\n  parents,\n  author,\n  committer,\n});\n\n// Proxy request body\n{\n  \"actionName\": \"github.git.createCommit\",\n  \"owner\": \"acme\",\n  \"repo\": \"monorepo\",\n  \"message\": \"commit message\",\n  \"tree\": \"abc123\",\n  \"stringifiedParents\": \"[\\\"parent-sha\\\"]\",\n  \"stringifiedAuthor\": \"{\\\"name\\\":\\\"Acme Bot\\\",\\\"email\\\":\\\"bot@example.com\\\"}\"\n}\n```\n\n## Parameters\n\ntable\n  thead\n    tr\n      thname/th\n      threquired/th\n      thdescription/th\n    /tr\n  /thead\n  tbody\n    trtdowner/tdtdyes/tdtd\n\nThe account owner of the repository. The name is not case sensitive.\n\n/td/tr\ntrtdrepo/tdtdyes/tdtd\n\nThe name of the repository without the `.git` extension. The name is not case sensitive.\n\n/td/tr\ntrtdmessage/tdtdyes/tdtd\n\nThe commit message\n\n/td/tr\ntrtdtree/tdtdyes/tdtd\n\nThe SHA of the tree object this commit points to\n\n/td/tr\ntrtdstringifiedParents/tdtdno/tdtd\n\nA JSON string encoding the `parents` array.\n\n/td/tr\ntrtdstringifiedAuthor/tdtdno/tdtd\n\nA JSON string encoding the `author` object.\n\n/td/tr\ntrtdstringifiedCommitter/tdtdno/tdtd\n\nA JSON string encoding the `committer` object.\n\n/td/tr\ntrtdsignature/tdtdno/tdtd\n\nThe [PGP signature](https://en.wikipedia.org/wiki/Pretty_Good_Privacy) of the commit. GitHub adds the signature to the `gpgsig` header of the created commit. For a commit signature to be verifiable by Git or GitHub, it must be an ASCII-armored detached PGP signature over the string commit as it would be written to the object database. To pass a `signature` parameter, you need to first manually create a valid PGP signature, which can be complicated. You may find it easier to [use the command line](https://git-scm.com/book/id/v2/Git-Tools-Signing-Your-Work) to create signed commits.\n\n/td/tr\n  /tbody\n/table\n\nSee also: [GitHub Developer Guide documentation](https://docs.github.com/rest/git/commits#create-a-commit).",
};
