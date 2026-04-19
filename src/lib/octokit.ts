import { Octokit } from "@octokit/core";
import { restEndpointMethods } from "@octokit/plugin-rest-endpoint-methods";
import { App } from "@octokit/app";
import { GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY } from "../config.js";

const OctokitWithRest = Octokit.plugin(restEndpointMethods);

export const app = new App({
  appId: GITHUB_APP_ID,
  privateKey: GITHUB_APP_PRIVATE_KEY,
  Octokit: OctokitWithRest,
});

export type AppOctokit = InstanceType<typeof OctokitWithRest>;

export async function getInstallationOctokit(
  owner: string,
  repo: string,
): Promise<AppOctokit> {
  const { data: installation } = await app.octokit.request(
    "GET /repos/{owner}/{repo}/installation",
    { owner, repo },
  );
  return app.getInstallationOctokit(installation.id) as Promise<AppOctokit>;
}
