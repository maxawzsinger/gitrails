import { Router } from "express";
import type { Request, Response } from "express";
import { db } from "../db.js";
import { requireAgentKey, requirePrincipalKey } from "../middleware/auth.js";
import { decrypt } from "../lib/encryption.js";

export const requestsRouter = Router();

function sendRequestsResponse(
  req: Request,
  res: Response,
  whereClause: string,
  whereParam: string,
) {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50));
  const offset = (page - 1) * limit;

  const rows = db
    .prepare(
      `SELECT r.id, r.agentKeyId, r.encryptedRequest, r.encryptedResponse, r.createdAt, ak.prefix
       FROM requests r
       JOIN agentKeys ak ON r.agentKeyId = ak.id
       ${whereClause}
       ORDER BY r.createdAt DESC
       LIMIT ? OFFSET ?`
    )
    .all(whereParam, limit, offset) as {
      id: string;
      agentKeyId: string;
      encryptedRequest: string;
      encryptedResponse: string;
      createdAt: number;
      prefix: string;
    }[];

  const total = (
    db
      .prepare(
        `SELECT COUNT(*) as count
         FROM requests r
         JOIN agentKeys ak ON r.agentKeyId = ak.id
         ${whereClause}`,
      )
      .get(whereParam) as { count: number }
  ).count;

  res.json({
    page,
    limit,
    total,
    requests: rows.map((r) => ({
      id: r.id,
      agentKeyPrefix: r.prefix,
      request: JSON.parse(decrypt(r.encryptedRequest)),
      response: JSON.parse(decrypt(r.encryptedResponse)),
      createdAt: r.createdAt,
    })),
  });
}

requestsRouter.get("/", requireAgentKey, (req, res) => {
  sendRequestsResponse(req, res, "WHERE r.agentKeyId = ?", req.authedAgentKey!.agentKeyId);
});

requestsRouter.get("/all", requirePrincipalKey, (req, res) => {
  sendRequestsResponse(req, res, "WHERE ak.githubTargetId = ?", req.authedGitHubTarget!.githubTargetId);
});
