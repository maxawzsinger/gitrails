import { endpointRegistry } from "./endpointRegistry.js";

export type Perms = Record<string, Record<string, string>>;

export function validatePerms(perms: unknown): { ok: true } | { ok: false; error: string } {
  if (typeof perms !== "object" || perms === null || Array.isArray(perms)) {
    return { ok: false, error: "Permissions must be a JSON object." };
  }

  for (const [actionName, paramConstraints] of Object.entries(perms as Record<string, unknown>)) {
    const endpoint = endpointRegistry[actionName];
    if (!endpoint) {
      return { ok: false, error: `Unknown action: "${actionName}".` };
    }

    if (typeof paramConstraints !== "object" || paramConstraints === null || Array.isArray(paramConstraints)) {
      return { ok: false, error: `Constraints for "${actionName}" must be a JSON object.` };
    }

    // Get valid param names from the schema (strip actionName itself)
    const schemaShape = endpoint.requestSchema.shape;
    const validParams = new Set(Object.keys(schemaShape).filter((k) => k !== "actionName"));

    for (const [paramName, regex] of Object.entries(paramConstraints as Record<string, unknown>)) {
      if (!validParams.has(paramName)) {
        return {
          ok: false,
          error: `Unknown param "${paramName}" for action "${actionName}". Valid params: ${[...validParams].join(", ")}.`,
        };
      }

      if (typeof regex !== "string") {
        return { ok: false, error: `Regex for "${actionName}.${paramName}" must be a string.` };
      }

      try {
        new RegExp(regex);
      } catch {
        return { ok: false, error: `Invalid regex for "${actionName}.${paramName}": "${regex}".` };
      }
    }
  }

  return { ok: true };
}
