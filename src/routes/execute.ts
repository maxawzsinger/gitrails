import { Router } from "express";
import { v4 as uuid } from "uuid";
import { db } from "../db.js";
import { requireAgentKey } from "../middleware/auth.js";
import { endpointRegistry } from "../lib/endpointRegistry.js";
import { encrypt, truncateForStorage } from "../lib/encryption.js";

export const executeRouter = Router();

executeRouter.post("/", requireAgentKey, async (req, res) => {
  const body = req.body as Record<string, unknown>;
  const actionName = body.actionName as string | undefined;

  if (!actionName || typeof actionName !== "string") {
    res.status(400).json({ error: "actionName is required." });
    return;
  }

  // Registry lookup
  const endpoint = endpointRegistry[actionName];
  if (!endpoint) {
    res.status(400).json({ error: `Unknown action: "${actionName}".` });
    return;
  }

  // Schema validation
  const parsed = endpoint.requestSchema.safeParse(body);
  if (!parsed.success) {
    res.status(400).json({ error: "Request validation failed.", details: parsed.error.issues });
    return;
  }

  // Permission check
  const perms = req.authedAgentKey!.permissions;
  const actionPerms = perms[actionName];
  if (!actionPerms) {
    res.status(403).json({ error: `No permission for action "${actionName}".` });
    return;
  }

  // Regex constraint check
  for (const [paramName, regex] of Object.entries(actionPerms)) {
    const paramValue = String((parsed.data as Record<string, unknown>)[paramName] ?? "");
    if (!new RegExp(regex).test(paramValue)) {
      res.status(403).json({
        error: `Parameter "${paramName}" value "${paramValue}" does not match constraint /${regex}/.`,
      });
      return;
    }
  }

  // Execute
  try {
    const result = await endpoint.executeRequest(parsed.data);

    // Log request + response
    db.prepare(
      "INSERT INTO requests (id, userId, agentKeyId, encryptedRequest, encryptedResponse, createdAt) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(
      uuid(),
      req.authedUser!.userId,
      req.authedAgentKey!.agentKeyId,
      encrypt(truncateForStorage(parsed.data)),
      encrypt(truncateForStorage(result)),
      Date.now()
    );

    res.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(502).json({ error: `GitHub API error: ${message}` });
  }
});
