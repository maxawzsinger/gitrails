import type { Request, Response, NextFunction } from "express";
import { db } from "../db.js";
import { sha256 } from "../lib/crypto.js";

export type AuthedPrincipal = {
  principalKeyId: string;
  githubId: string;
  githubLogin: string | null;
};

export type AuthedAgentKey = AuthedPrincipal & {
  agentKeyId: string;
  permissions: Record<string, Record<string, string>>;
};

// Resolves any valid key (principal key or agent key) to a principal.
// Attaches req.authedPrincipal. If it's an agent key, also attaches req.authedAgentKey.
export function requireAnyKey(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing Authorization header." });
    return;
  }
  const token = header.slice(7);
  const hash = sha256(token);

  // Check principal key first
  const principalByKey = db
    .prepare("SELECT id, githubId, githubLogin FROM principalKeys WHERE keyHash = ?")
    .get(hash) as
    | {
        id: string;
        githubId: string;
        githubLogin: string | null;
      }
    | undefined;

  if (principalByKey) {
    req.authedPrincipal = {
      principalKeyId: principalByKey.id,
      githubId: principalByKey.githubId,
      githubLogin: principalByKey.githubLogin,
    };
    next();
    return;
  }

  // Check agent key
  const agentKeyRow = db
    .prepare(
      `SELECT ak.id as agentKeyId, ak.principalKeyId, ak.permissions, pk.githubId, pk.githubLogin
       FROM agentKeys ak JOIN principalKeys pk ON ak.principalKeyId = pk.id
       WHERE ak.keyHash = ?`,
    )
    .get(hash) as
    | {
        agentKeyId: string;
        principalKeyId: string;
        permissions: string;
        githubId: string;
        githubLogin: string | null;
      }
    | undefined;

  if (agentKeyRow) {
    req.authedPrincipal = {
      principalKeyId: agentKeyRow.principalKeyId,
      githubId: agentKeyRow.githubId,
      githubLogin: agentKeyRow.githubLogin,
    };
    req.authedAgentKey = {
      principalKeyId: agentKeyRow.principalKeyId,
      githubId: agentKeyRow.githubId,
      githubLogin: agentKeyRow.githubLogin,
      agentKeyId: agentKeyRow.agentKeyId,
      permissions: JSON.parse(agentKeyRow.permissions),
    };
    next();
    return;
  }

  res.status(401).json({ error: "Invalid principal key or agent key." });
}

// Requires an agent key (not a principal key). Ensures req.authedAgentKey is set.
export function requireAgentKey(req: Request, res: Response, next: NextFunction) {
  requireAnyKey(req, res, () => {
    if (!req.authedAgentKey) {
      res
        .status(403)
        .json({
          error: "This endpoint requires an agent key, not a principal key.",
        });
      return;
    }
    next();
  });
}

// Requires a principal key (not an agent key).
export function requirePrincipalKey(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  requireAnyKey(req, res, () => {
    if (req.authedAgentKey) {
      res
        .status(403)
        .json({
          error: "This endpoint requires a principal key, not an agent key.",
        });
      return;
    }
    next();
  });
}

// Augment Express Request
declare global {
  namespace Express {
    interface Request {
      authedPrincipal?: AuthedPrincipal;
      authedAgentKey?: AuthedAgentKey;
    }
  }
}
