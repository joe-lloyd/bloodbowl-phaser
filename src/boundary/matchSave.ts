import { matchSaveSchema } from "./schemas/MatchSave";
import { parseJson } from "./json";
import type { MatchSave } from "../headless/serialization";

export function parseMatchSave(value: unknown): MatchSave {
  if (typeof value === "string") return parseJson(value, matchSaveSchema);
  const parsed = matchSaveSchema.safeParse(value);
  if (!parsed.success) throw new Error("unsupported-or-invalid-match-save");
  return parsed.data;
}

export function normalizeMatchSave(value: MatchSave): MatchSave {
  return parseJson(JSON.stringify(value), matchSaveSchema);
}
