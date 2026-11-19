import type { z } from "zod";

export function parseJson<Value>(text: string, schema: z.ZodType<Value>): Value {
  const value: unknown = JSON.parse(text);
  return schema.parse(value);
}

export async function fetchJson<Value>(url: string, schema: z.ZodType<Value>): Promise<Value> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${String(response.status)}`);
  const value: unknown = await response.json();
  return schema.parse(value);
}
