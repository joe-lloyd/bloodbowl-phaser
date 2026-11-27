import type { z } from "zod";

export function parseJson<Value>(text: string, schema: z.ZodType<Value>): Value {
  const value: unknown = JSON.parse(text);
  return schema.parse(value);
}

