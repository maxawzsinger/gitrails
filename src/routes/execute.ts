import { Router } from "express";
import { v4 as uuid } from "uuid";
import { db } from "../db.js";
import { requireAgentKey } from "../middleware/auth.js";
import { endpointRegistry } from "../lib/endpointRegistry.js";
import type { EndpointObject } from "../lib/endpointTypes.js";
import type { ActionName } from "../lib/permissionTypes.js";
import { encrypt, truncateForStorage } from "../lib/encryption.js";
import { EndpointRequestError } from "../lib/stringifiedJson.js";

export const executeRouter = Router();

executeRouter.post("/", requireAgentKey, async (req, res) => {
  const body = req.body as Record<string, unknown>;
  const actionName = body.actionName as string | undefined;

  if (!actionName || typeof actionName !== "string") {
    res.status(400).json({ error: "actionName is required." });
    return;
  }

  // Registry lookup
  if (!Object.hasOwn(endpointRegistry, actionName)) {
    res.status(400).json({ error: `Unknown action: "${actionName}".` });
    return;
  }
  const typedActionName = actionName as ActionName;
  const endpoint = endpointRegistry[typedActionName] as EndpointObject;

  // Schema validation
  const parsed = endpoint.requestSchema.safeParse(body);
  if (!parsed.success) {
    res.status(400).json({ error: "Request validation failed.", details: parsed.error.issues });
    return;
  }

  // Permission check
  const perms = req.authedAgentKey!.permissions;
  const actionPerms = perms[typedActionName];
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
      "INSERT INTO requests (id, agentKeyId, encryptedRequest, encryptedResponse, createdAt) VALUES (?, ?, ?, ?, ?)"
    ).run(
      uuid(),
      req.authedAgentKey!.agentKeyId,
      encrypt(truncateForStorage(parsed.data)),
      encrypt(truncateForStorage(result)),
      Date.now()
    );

    res.json(result);
  } catch (err: unknown) {
    if (err instanceof EndpointRequestError) {
      res.status(400).json({ error: err.message });
      return;
    }

    const octokitStatus = err instanceof Error ? (err as { status?: unknown }).status : undefined;
    if (err instanceof Error && typeof octokitStatus === "number") {
      res.status(octokitStatus).json({
        ...Object.fromEntries(
          Object.getOwnPropertyNames(err).map((key) => [
            key,
            (err as unknown as Record<string, unknown>)[key],
          ]),
        ),
        name: err.name,
        message: err.message,
      });
      return;
    }

    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(502).json({ error: `GitHub API error: ${message}` });
  }
});
