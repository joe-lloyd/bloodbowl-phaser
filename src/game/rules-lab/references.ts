/**
 * Stable reference resolution.
 *
 * Runtime player and team ids embed generation order (and, for browser
 * teams, `Date.now()`), so nothing that has to survive a rerun — a script, a
 * committed variant, a bug report, a sandbox URL — may contain one. Cases
 * address teams as `team1`/`team2` and players as `team1:3` (index into that
 * team's players array, which is what `PlayerPlacement.playerIndex` means).
 *
 * This module is the single resolver for both lanes: the headless runner
 * passes its live game context, the browser adapter passes the two teams it
 * read out of the test bridge.
 */

import { HeadlessCommand } from "../../headless/protocol";

/** The minimum a caller must supply to resolve refs. */
export interface RefContext {
  team1: { id: string; players: { id: string }[] };
  team2: { id: string; players: { id: string }[] };
}

const PLAYER_REF = /^(team1|team2):(\d+)$/;

/** True for `team1` / `team2`. */
export function isTeamRef(ref: string): boolean {
  return ref === "team1" || ref === "team2";
}

/** True for `team1:0`-style player references. */
export function isPlayerRef(ref: string): boolean {
  return PLAYER_REF.test(ref);
}

/**
 * Resolve a stable ref to this run's id. Anything that is not a recognised
 * ref is passed through untouched, so a literal id still works.
 */
export function resolveReference(ctx: RefContext, ref: string): string {
  const match = PLAYER_REF.exec(ref);
  if (match) {
    const team = match[1] === "team1" ? ctx.team1 : ctx.team2;
    const player = team.players[Number(match[2])];
    if (!player) throw new Error(`no player for ref '${ref}'`);
    return player.id;
  }
  if (ref === "team1") return ctx.team1.id;
  if (ref === "team2") return ctx.team2.id;
  return ref;
}

/** Every protocol field that may carry a team or player reference. */
export const REFERENCE_FIELDS = [
  "playerId",
  "attackerId",
  "defenderId",
  "defender1Id",
  "defender2Id",
  "player1Id",
  "player2Id",
  "throwerId",
  "teammateId",
  "targetId",
  "teamId",
  "kickingTeamId",
] as const;

/** Resolve every reference field of a command for this run. */
export function resolveCommandReferences(
  ctx: RefContext,
  command: HeadlessCommand
): HeadlessCommand {
  const resolved = { ...command } as Record<string, unknown>;
  for (const field of REFERENCE_FIELDS) {
    const value = resolved[field];
    if (typeof value === "string") {
      resolved[field] = resolveReference(ctx, value);
    }
  }
  // `award-mvp` carries a list rather than a single field.
  if (Array.isArray(resolved.nominatedPlayerIds)) {
    resolved.nominatedPlayerIds = (
      resolved.nominatedPlayerIds as string[]
    ).map((value) => resolveReference(ctx, value));
  }
  return resolved as HeadlessCommand;
}

/** Every reference a command mentions, for validation and reporting. */
export function referencesInCommand(command: HeadlessCommand): string[] {
  const record = command as unknown as Record<string, unknown>;
  const refs: string[] = [];
  for (const field of REFERENCE_FIELDS) {
    const value = record[field];
    if (typeof value === "string" && (isPlayerRef(value) || isTeamRef(value))) {
      refs.push(value);
    }
  }
  if (Array.isArray(record.nominatedPlayerIds)) {
    for (const value of record.nominatedPlayerIds as unknown[]) {
      if (typeof value === "string" && isPlayerRef(value)) refs.push(value);
    }
  }
  return refs;
}

/** The team side and player index a player ref names. */
export function parsePlayerRef(
  ref: string
): { team: "team1" | "team2"; index: number } | null {
  const match = PLAYER_REF.exec(ref);
  if (!match) return null;
  return { team: match[1] as "team1" | "team2", index: Number(match[2]) };
}
