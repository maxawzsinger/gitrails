import { Router } from "express";
import crypto from "node:crypto";
import { v4 as uuid } from "uuid";
import { sha256 } from "../lib/crypto.js";
import { app as githubApp } from "../lib/octokit.js";
import { db } from "../db.js";

export const githubTargetsRouter = Router();

type GitHubAccount =
  | { id: number; login: string }
  | { id: number; slug: string }
  | null
  | undefined;

function getGitHubAccountHandle(account: GitHubAccount): string | null {
  if (!account) {
    return null;
  }
  if ("login" in account) {
    return account.login;
  }
  return account.slug;
}

// GitHub App setup callback. Configure the app's setup URL to point here.
githubTargetsRouter.get("/github-app-callback", async (req, res) => {
  const installationIdParam = req.query.installation_id;
  if (typeof installationIdParam !== "string") {
    res.status(400).send("Missing installation_id parameter.");
    return;
  }

  const installationId = Number.parseInt(installationIdParam, 10);
  if (!Number.isSafeInteger(installationId) || installationId <= 0) {
    res.status(400).send("installation_id must be a positive integer.");
    return;
  }

  try {
    const installationResponse = await githubApp.octokit.request(
      "GET /app/installations/{installation_id}",
      {
        installation_id: installationId,
      },
    );
    const githubAccount = installationResponse.data.account;
    if (!githubAccount) {
      res.status(502).send("GitHub installation is missing an account.");
      return;
    }

    const githubId = String(githubAccount.id);
    const githubLogin = getGitHubAccountHandle(githubAccount);
    const accountMessage = githubLogin
      ? `GitHub App installation detected for ${githubLogin}.`
      : "GitHub App installation detected.";
    const principalKeyPlaintext = `pk_${crypto.randomBytes(32).toString("hex")}`;
    const keyHash = sha256(principalKeyPlaintext);
    const existingGitHubTarget = db
      .prepare("SELECT id FROM githubTargets WHERE githubId = ?")
      .get(githubId) as { id: string } | undefined;

    const didRotateExistingKey = existingGitHubTarget !== undefined;
    const recoveryMessage = didRotateExistingKey
      ? "Existing principal key rotated. Existing agent keys were preserved."
      : "New principal key created.";

    if (existingGitHubTarget) {
      db.prepare("UPDATE githubTargets SET keyHash = ?, githubLogin = ? WHERE id = ?").run(
        keyHash,
        githubLogin,
        existingGitHubTarget.id,
      );
    } else {
      db.prepare(
        "INSERT INTO githubTargets (id, githubId, keyHash, githubLogin, createdAt) VALUES (?, ?, ?, ?, ?)",
      ).run(uuid(), githubId, keyHash, githubLogin, Date.now());
    }

    res
      .type("html")
      .send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>GitHub App Setup Complete</title>
  </head>
  <body>
    <h1>GitHub App setup complete</h1>
    <p>${accountMessage}</p>
    <p>${recoveryMessage}</p>
    <p>This principal key is shown once. Store it somewhere safe.</p>
    <pre><code>${principalKeyPlaintext}</code></pre>
  </body>
</html>`);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown GitHub App error.";
    res.status(502).send(`Failed to resolve GitHub App installation: ${message}`);
  }
});
