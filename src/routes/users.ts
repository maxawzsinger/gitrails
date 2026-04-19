import { Router } from "express";
import crypto from "node:crypto";
import { v4 as uuid } from "uuid";
import { GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, BASE_URL } from "../config.js";
import { sha256 } from "../lib/crypto.js";
import { app as githubApp } from "../lib/octokit.js";
import { db } from "../db.js";
import { requirePrincipalKey } from "../middleware/auth.js";

export const usersRouter = Router();

function renderOAuthResultPage(principalKey: string, isExistingUser: boolean): string {
  const message = isExistingUser
    ? "Principal key rotated. Existing agent keys were invalidated."
    : "Account created. Save this principal key now.";
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>GitHub OAuth Complete</title>
    <style>
      body {
        margin: 0;
        font-family: sans-serif;
        background: #0b1020;
        color: #e5e7eb;
      }
      main {
        max-width: 720px;
        margin: 64px auto;
        padding: 32px;
        background: #111827;
        border-radius: 12px;
      }
      code {
        display: block;
        margin: 16px 0;
        padding: 16px;
        background: #030712;
        border-radius: 8px;
        overflow-wrap: anywhere;
      }
      p {
        line-height: 1.5;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>GitHub OAuth complete</h1>
      <p>${message}</p>
      <p>This principal key is shown once. Store it somewhere safe.</p>
      <code>${principalKey}</code>
    </main>
  </body>
</html>`;
}

usersRouter.get("/installations", requirePrincipalKey, async (_req, res) => {
  const installations: {
    id: number;
    account: string | undefined;
    permissions: Record<string, string> | undefined;
    repositorySelection: string;
  }[] = [];

  for await (const { installation } of githubApp.eachInstallation.iterator()) {
    installations.push({
      id: installation.id,
      account: installation.account?.login,
      permissions: installation.permissions,
      repositorySelection: installation.repository_selection,
    });
  }

  res.json({ installations });
});

// Redirect to GitHub OAuth to create an account or issue a principal key.
usersRouter.get("/sign-in-with-oauth-and-rotate-principal-key", (_req, res) => {
  const params = new URLSearchParams({
    client_id: GITHUB_CLIENT_ID,
    redirect_uri: `${BASE_URL}/users/oauth-flow-callback`,
    scope: "",
  });
  res.redirect(`https://github.com/login/oauth/authorize?${params}`);
});

// OAuth callback
usersRouter.get("/oauth-flow-callback", async (req, res) => {
  const code = req.query.code as string;
  if (!code) {
    res.status(400).send("Missing code parameter.");
    return;
  }

  // Exchange code for access token
  const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      client_id: GITHUB_CLIENT_ID,
      client_secret: GITHUB_CLIENT_SECRET,
      code,
    }),
  });
  const tokenData = (await tokenRes.json()) as { access_token?: string; error?: string };
  if (!tokenData.access_token) {
    res.status(400).send(`OAuth error: ${tokenData.error ?? "no access_token"}`);
    return;
  }

  // Fetch GitHub user
  const userRes = await fetch("https://api.github.com/user", {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });
  const githubUser = (await userRes.json()) as { id: number; login: string };

  const githubId = String(githubUser.id);
  const existing = db.prepare("SELECT id, principalKeyHash FROM users WHERE githubId = ?").get(githubId) as
    | { id: string; principalKeyHash: string }
    | undefined;

  const principalKeyPlaintext = `pk_${crypto.randomBytes(32).toString("hex")}`;
  const principalKeyHash = sha256(principalKeyPlaintext);

  if (existing) {
    const replacePrincipalKeyAndInvalidateAgentKeys = db.transaction(() => {
      db.prepare("UPDATE users SET githubLogin = ?, principalKeyHash = ? WHERE id = ?").run(
        githubUser.login,
        principalKeyHash,
        existing.id
      );
      db.prepare("DELETE FROM agentKeys WHERE userId = ?").run(existing.id);
    });
    replacePrincipalKeyAndInvalidateAgentKeys();
    res.type("html").send(renderOAuthResultPage(principalKeyPlaintext, true));
    return;
  }

  // New user - create account + principal key
  const userId = uuid();

  db.prepare(
    "INSERT INTO users (id, githubId, githubLogin, principalKeyHash, createdAt) VALUES (?, ?, ?, ?, ?)"
  ).run(userId, githubId, githubUser.login, principalKeyHash, Date.now());

  res.type("html").send(renderOAuthResultPage(principalKeyPlaintext, false));
});
