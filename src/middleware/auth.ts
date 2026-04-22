import type { Request, Response, NextFunction } from "express";
import { db } from "../db.js";
import { sha256 } from "../lib/crypto.js";
import type { Perms } from "../lib/permissionTypes.js";
import { parsePermsJson } from "../lib/validatePerms.js";

export type AuthedGitHubTarget = {
  githubTargetId: string;
  githubId: string;
  githubLogin: string | null;
};

export type AuthedAgentKey = AuthedGitHubTarget & {
  agentKeyId: string;
  permissions: Perms;
};

function resolveKey(req: Request, res: Response): boolean {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing Authorization header." });
    return false;
  }
  const token = header.slice(7);
  const hash = sha256(token);

  // Check principal key first.
  const githubTargetByKey = db
    .prepare("SELECT id, githubId, githubLogin FROM githubTargets WHERE keyHash = ?")
    .get(hash) as
    | {
        id: string;
        githubId: string;
        githubLogin: string | null;
      }
    | undefined;

  if (githubTargetByKey) {
    req.authedGitHubTarget = {
      githubTargetId: githubTargetByKey.id,
      githubId: githubTargetByKey.githubId,
      githubLogin: githubTargetByKey.githubLogin,
    };
    req.authedAgentKey = undefined;
    return true;
  }

  // Check agent key.
  const agentKeyRow = db
    .prepare(
      `SELECT ak.id as agentKeyId, ak.githubTargetId, ak.permissions, gt.githubId, gt.githubLogin
       FROM agentKeys ak JOIN githubTargets gt ON ak.githubTargetId = gt.id
       WHERE ak.keyHash = ?`,
    )
    .get(hash) as
    | {
        agentKeyId: string;
        githubTargetId: string;
        permissions: string;
        githubId: string;
        githubLogin: string | null;
      }
    | undefined;

  if (agentKeyRow) {
    req.authedGitHubTarget = {
      githubTargetId: agentKeyRow.githubTargetId,
      githubId: agentKeyRow.githubId,
      githubLogin: agentKeyRow.githubLogin,
    };
    req.authedAgentKey = {
      githubTargetId: agentKeyRow.githubTargetId,
      githubId: agentKeyRow.githubId,
      githubLogin: agentKeyRow.githubLogin,
      agentKeyId: agentKeyRow.agentKeyId,
      permissions: parsePermsJson(agentKeyRow.permissions),
    };
    return true;
  }

  res.status(401).json({ error: "Invalid principal key or agent key." });
  return false;
}

// Requires an agent key (not a principal key). Ensures req.authedAgentKey is set.
export function requireAgentKey(req: Request, res: Response, next: NextFunction) {
  if (!resolveKey(req, res)) {
    return;
  }
  if (!req.authedAgentKey) {
    res.status(403).json({
      error: "This endpoint requires an agent key, not a principal key.",
    });
    return;
  }
  next();
}

// Requires a principal key (not an agent key).
export function requirePrincipalKey(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if (!resolveKey(req, res)) {
    return;
  }
  if (req.authedAgentKey) {
    res.status(403).json({
      error: "This endpoint requires a principal key, not an agent key.",
    });
    return;
  }
  next();
}

// Augment Express Request
declare global {
  namespace Express {
    interface Request {
      authedGitHubTarget?: AuthedGitHubTarget;
      authedAgentKey?: AuthedAgentKey;
    }
  }
}
