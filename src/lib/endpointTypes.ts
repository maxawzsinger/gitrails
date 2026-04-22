import { z } from "zod/v4";

type AnyZodObject = z.ZodObject<z.ZodRawShape>;

export const baseRequestSchema = z.object({
  actionName: z.string().min(1),
});

export type EndpointObject<TSchema extends AnyZodObject = AnyZodObject> = {
  requestSchema: TSchema;
  executeRequest: (request: z.infer<TSchema>) => Promise<unknown>;
  documentation: string;
};

export type RequestForEndpoint<TEndpoint extends EndpointObject> = z.infer<
  TEndpoint["requestSchema"]
>;
