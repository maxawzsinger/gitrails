import { z } from "zod/v4";

export class EndpointRequestError extends Error {}

function describeSchema(schema: z.ZodType): string {
  if (schema instanceof z.ZodArray) {
    return "JSON array";
  }
  if (schema instanceof z.ZodObject) {
    return "JSON object";
  }
  return "JSON value";
}

export function parseStringifiedJson<TSchema extends z.ZodType>(
  value: string,
  fieldName: string,
  schema: TSchema,
): z.infer<TSchema> {
  let parsed: unknown;

  try {
    parsed = JSON.parse(value);
  } catch {
    throw new EndpointRequestError(
      `Invalid JSON for "${fieldName}". Expected a ${describeSchema(schema)} string. Check the endpoint documentation for stringified params.`,
    );
  }

  const result = schema.safeParse(parsed);
  if (!result.success) {
    const issue = result.error.issues[0];
    const detail = issue ? ` ${issue.message}` : "";
    throw new EndpointRequestError(
      `Invalid value for "${fieldName}". Expected a ${describeSchema(schema)} string.${detail}`,
    );
  }

  return result.data;
}
