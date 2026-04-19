import type { Request, Response, NextFunction } from "express";
import { db } from "../db.js";
import { sha256 } from "../lib/crypto.js";

export type AuthedUser = {
  userId: string;
  githubLogin: string;
};

export type AuthedAgentKey = AuthedUser & {
  agentKeyId: string;
  permissions: Record<string, Record<string, string>>;
};

// Resolves any valid key (principle key or agent key) to a user.
// Attaches req.authedUser. If it's an agent key, also attaches req.authedAgentKey.
export function requireAnyKey(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing Authorization header." });
    return;
  }
  const token = header.slice(7);

  const hash = sha256(token);

  // Check principle key first
  const userByPrinciple = db
    .prepare("SELECT id, githubLogin FROM users WHERE principleKeyHash = ?")
    .get(hash) as { id: string; githubLogin: string } | undefined;

  if (userByPrinciple) {
    req.authedUser = {
      userId: userByPrinciple.id,
      githubLogin: userByPrinciple.githubLogin,
    };
    next();
    return;
  }

  // Check agent key
  const agentKeyRow = db
    .prepare(
      `SELECT ak.id as agentKeyId, ak.userId, ak.permissions, u.githubLogin
       FROM agentKeys ak JOIN users u ON ak.userId = u.id
       WHERE ak.keyHash = ?`,
    )
    .get(hash) as
    | {
        agentKeyId: string;
        userId: string;
        permissions: string;
        githubLogin: string;
      }
    | undefined;

  if (agentKeyRow) {
    req.authedUser = {
      userId: agentKeyRow.userId,
      githubLogin: agentKeyRow.githubLogin,
    };
    req.authedAgentKey = {
      userId: agentKeyRow.userId,
      githubLogin: agentKeyRow.githubLogin,
      agentKeyId: agentKeyRow.agentKeyId,
      permissions: JSON.parse(agentKeyRow.permissions),
    };
    next();
    return;
  }

  res.status(401).json({ error: "Invalid principle key or agent key." });
}

// Requires an agent key (not a principle key). Ensures req.authedAgentKey is set.
export function requireAgentKey(req: Request, res: Response, next: NextFunction) {
  requireAnyKey(req, res, () => {
    if (!req.authedAgentKey) {
      res
        .status(403)
        .json({
          error: "This endpoint requires an agent key, not a principle key.",
        });
      return;
    }
    next();
  });
}

// Requires a principle key (not an agent key).
export function requirePrincipleKey(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  requireAnyKey(req, res, () => {
    if (req.authedAgentKey) {
      res
        .status(403)
        .json({
          error: "This endpoint requires a principle key, not an agent key.",
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
      authedUser?: AuthedUser;
      authedAgentKey?: AuthedAgentKey;
    }
  }
}
