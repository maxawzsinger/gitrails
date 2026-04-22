import { endpointRegistry } from "./endpointRegistry.js";
import type { ActionName, Perms } from "./permissionTypes.js";

export function validatePerms(
  perms: unknown,
): { ok: true; perms: Perms } | { ok: false; error: string } {
  if (typeof perms !== "object" || perms === null || Array.isArray(perms)) {
    return { ok: false, error: "Permissions must be a JSON object." };
  }

  for (const [actionName, paramConstraints] of Object.entries(
    perms as Record<string, unknown>,
  )) {
    if (!Object.hasOwn(endpointRegistry, actionName)) {
      return { ok: false, error: `Unknown action: "${actionName}".` };
    }
    const typedActionName = actionName as ActionName;
    const endpoint = endpointRegistry[typedActionName];

    if (
      typeof paramConstraints !== "object" ||
      paramConstraints === null ||
      Array.isArray(paramConstraints)
    ) {
      return {
        ok: false,
        error: `Constraints for "${actionName}" must be a JSON object.`,
      };
    }

    // Get valid param names from the schema (strip actionName itself)
    const schemaShape = endpoint.requestSchema.shape;
    const validParams = new Set(
      Object.keys(schemaShape).filter((k) => k !== "actionName"),
    );

    for (const [paramName, regex] of Object.entries(
      paramConstraints as Record<string, unknown>,
    )) {
      if (!validParams.has(paramName)) {
        return {
          ok: false,
          error: `Unknown param "${paramName}" for action "${actionName}". Valid params: ${[...validParams].join(", ")}.`,
        };
      }

      if (typeof regex !== "string") {
        return {
          ok: false,
          error: `Regex for "${actionName}.${paramName}" must be a string.`,
        };
      }

      try {
        new RegExp(regex);
      } catch {
        return {
          ok: false,
          error: `Invalid regex for "${actionName}.${paramName}": "${regex}".`,
        };
      }
    }
  }

  return { ok: true, perms: perms as Perms };
}

export function parsePermsJson(permsJson: string): Perms {
  let parsedPerms: unknown;

  try {
    parsedPerms = JSON.parse(permsJson);
  } catch {
    throw new Error("Stored permissions are not valid JSON.");
  }

  const result = validatePerms(parsedPerms);
  if (!result.ok) {
    throw new Error(`Stored permissions are invalid: ${result.error}`);
  }

  return result.perms;
}
