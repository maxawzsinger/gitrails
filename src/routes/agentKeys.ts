import { Router } from "express";
import crypto from "node:crypto";
import { v4 as uuid } from "uuid";
import { sha256 } from "../lib/crypto.js";
import { db } from "../db.js";
import { validatePerms } from "../lib/validatePerms.js";
import { requireAgentKey, requirePrincipleKey } from "../middleware/auth.js";

export const agentKeysRouter = Router();
const AGENT_KEY_PREFIX_REGEX = /^[a-z_]+$/;

// List keys for the authenticated user
agentKeysRouter.get("/", requirePrincipleKey, (req, res) => {
  const rows = db
    .prepare(
      "SELECT id, prefix, permissions, createdAt FROM agentKeys WHERE userId = ? ORDER BY createdAt DESC",
    )
    .all(req.authedUser!.userId) as {
    id: string;
    prefix: string;
    permissions: string;
    createdAt: number;
  }[];

  res.json(
    rows.map((r) => ({
      id: r.id,
      prefix: r.prefix,
      permissions: JSON.parse(r.permissions),
      createdAt: r.createdAt,
    })),
  );
});

// Return the authenticated agent key row.
agentKeysRouter.get("/current", requireAgentKey, (req, res) => {
  const row = db
    .prepare(
      "SELECT id, userId, prefix, keyHash, permissions, createdAt FROM agentKeys WHERE id = ?",
    )
    .get(req.authedAgentKey!.agentKeyId) as
    | {
        id: string;
        userId: string;
        prefix: string;
        keyHash: string;
        permissions: string;
        createdAt: number;
      }
    | undefined;

  if (!row) {
    res.status(404).json({
      error: `
      Agent key not found. If you are using a principle key,
      use the /agentKeys route to list and manage keys.`,
    });
    return;
  }

  res.json({
    id: row.id,
    userId: row.userId,
    prefix: row.prefix,
    keyHash: row.keyHash,
    permissions: JSON.parse(row.permissions),
    createdAt: row.createdAt,
  });
});

// Create a new key
agentKeysRouter.post("/create", requirePrincipleKey, (req, res) => {
  const { prefix } = req.body as { prefix?: string };
  if (!prefix || typeof prefix !== "string" || prefix.trim().length === 0) {
    res.status(400).json({ error: "prefix is required." });
    return;
  }
  const trimmedPrefix = prefix.trim();
  if (!AGENT_KEY_PREFIX_REGEX.test(trimmedPrefix)) {
    res.status(400).json({
      error:
        "prefix must contain only lowercase letters and underscores (a-z, _).",
    });
    return;
  }

  const id = uuid();
  const secret = crypto.randomBytes(32).toString("hex");
  const plaintextKey = `gr_${trimmedPrefix}_${secret}`;
  const keyHash = sha256(plaintextKey);

  db.prepare(
    "INSERT INTO agentKeys (id, userId, prefix, keyHash, permissions, createdAt) VALUES (?, ?, ?, ?, '{}', ?)",
  ).run(id, req.authedUser!.userId, trimmedPrefix, keyHash, Date.now());

  res.json({ id, prefix: trimmedPrefix, key: plaintextKey });
});

// Delete a key
agentKeysRouter.delete("/:id", requirePrincipleKey, (req, res) => {
  const result = db
    .prepare("DELETE FROM agentKeys WHERE id = ? AND userId = ?")
    .run(req.params.id, req.authedUser!.userId);

  if (result.changes === 0) {
    res.status(404).json({ error: "Agent key not found." });
    return;
  }

  res.json({ ok: true });
});

// Replace the permissions policy for a key owned by the authenticated user.
/*
Example permissions object:

{
  "github.repos.get": {
    "owner": "^acme-inc$",
    "repo": "^(api|web)$"
  },
  "github.pulls.list": {
    "owner": "^acme-inc$",
    "repo": "^api$",
    "state": "^(open|closed)$"
  }
}
*/
agentKeysRouter.put("/:id/permissions", requirePrincipleKey, (req, res) => {
  const { permissions } = req.body as { permissions?: unknown };

  const keyRow = db
    .prepare("SELECT id FROM agentKeys WHERE id = ? AND userId = ?")
    .get(req.params.id, req.authedUser!.userId) as { id: string } | undefined;

  if (!keyRow) {
    res.status(404).json({ error: "Agent key not found." });
    return;
  }

  const result = validatePerms(permissions);
  if (!result.ok) {
    res.status(400).json({ error: result.error });
    return;
  }

  db.prepare("UPDATE agentKeys SET permissions = ? WHERE id = ?").run(
    JSON.stringify(permissions),
    req.params.id,
  );

  res.json({ ok: true });
});
