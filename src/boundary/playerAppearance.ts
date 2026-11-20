import { z } from "zod";
import type { PlayerAppearance } from "../types/Player";

const appearance = z.record(z.string(), z.string());

export function readAppearance(value: unknown): PlayerAppearance | undefined {
  const parsed = appearance.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}
