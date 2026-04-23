import { Router } from "express";
import { v4 as uuid } from "uuid";
import { db } from "../db.js";
import type { EndpointObject } from "../lib/endpointTypes.js";
import { requireAgentKey } from "../middleware/auth.js";
import { endpointRegistry } from "../lib/endpointRegistry.js";
import type { ActionName } from "../lib/permissionTypes.js";
import { encrypt, truncateForStorage } from "../lib/encryption.js";
import { EndpointRequestError } from "../lib/stringifiedJson.js";

export const executeRouter = Router();

// Upper bound on param values tested against a permission regex. Bounds the
// worst-case runtime of a catastrophic-backtracking pattern to protect the
// event loop from a ReDoS.
const MAX_CONSTRAINED_PARAM_LENGTH = 256;

executeRouter.post("/", requireAgentKey, async (req, res) => {
  const body = req.body as Record<string, unknown>;
  const actionName = body.actionName;

  if (typeof actionName !== "string" || actionName.length === 0) {
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
    res
      .status(400)
      .json({
        error: "Request validation failed.",
        details: parsed.error.issues,
      });
    return;
  }

  // Permission check
  const perms = req.authedAgentKey!.permissions;
  const actionPerms = perms[typedActionName];
  if (!actionPerms) {
    res
      .status(403)
      .json({ error: `No permission for action "${actionName}".` });
    return;
  }

  // Regex constraint check
  for (const [paramName, regex] of Object.entries(actionPerms)) {
    const rawValue = (parsed.data as Record<string, unknown>)[paramName];
    if (rawValue === undefined || rawValue === null) {
      res.status(403).json({
        error: `Parameter "${paramName}" is required because the agent key's permissions constrain it.`,
      });
      return;
    }
    const paramValue = String(rawValue);
    if (paramValue.length > MAX_CONSTRAINED_PARAM_LENGTH) {
      res.status(400).json({
        error: `Parameter "${paramName}" exceeds maximum length of ${MAX_CONSTRAINED_PARAM_LENGTH} characters for constrained params.`,
      });
      return;
    }
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
      "INSERT INTO requests (id, agentKeyId, encryptedRequest, encryptedResponse, createdAt) VALUES (?, ?, ?, ?, ?)",
    ).run(
      uuid(),
      req.authedAgentKey!.agentKeyId,
      encrypt(truncateForStorage(parsed.data)),
      encrypt(truncateForStorage(result)),
      Date.now(),
    );

    res.json(result);
  } catch (err: unknown) {
    if (err instanceof EndpointRequestError) {
      res.status(400).json({ error: err.message });
      return;
    }

    if (
      err instanceof Error &&
      "status" in err &&
      typeof err.status === "number"
    ) {
      // Only forward fields that are safe to echo back. Avoid leaking
      // request/response headers (may include the installation token) or
      // other internal Octokit state.
      const response =
        "response" in err &&
        typeof err.response === "object" &&
        err.response !== null &&
        "data" in err.response
          ? { data: err.response.data }
          : undefined;
      res.status(err.status).json({
        name: err.name,
        message: err.message,
        status: err.status,
        response,
      });
      return;
    }

    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(502).json({ error: `GitHub API error: ${message}` });
  }
});
