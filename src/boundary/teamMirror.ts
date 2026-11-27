import { z } from "zod";
import { parseJson } from "./json";

const KEY_PREFIX = "bloodbowl_account_teams_";

const mirrorSchema = z.object({
  teams: z.array(z.unknown()),
  synced: z.record(z.string(), z.string()),
  pending: z.array(z.string()),
  conflicts: z.record(z.string(), z.unknown()),
  syncedAt: z.number().nullable(),
});

export type TeamMirror = z.infer<typeof mirrorSchema>;

export function readTeamMirror(uid: string): TeamMirror | null {
  try {
    const text = localStorage.getItem(KEY_PREFIX + uid);
    return text === null ? null : parseJson(text, mirrorSchema);
  } catch (error) {
    console.error("Failed to read the teams kept on this device:", error);
    return null;
  }
}

export function writeTeamMirror(uid: string, mirror: TeamMirror): void {
  try {
    localStorage.setItem(KEY_PREFIX + uid, JSON.stringify(mirror));
  } catch (error) {
    console.error("Failed to keep the team library on this device:", error);
  }
}
