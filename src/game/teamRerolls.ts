/**
 * Team Re-rolls are a per-half allowance (2025 rulebook, "Team Re-rolls"):
 * the Team Re-roll Marker tracks how many remain this half, any used are
 * replenished at half-time, and unused ones never carry over to the next
 * half or fixture.
 *
 * `team.rerolls` is the roster's purchased count and is never spent. The
 * match tracks how many each team has used this half on game state, so it
 * travels with saves and online snapshots. Absent means none used, which is
 * also how a save from before this field loads.
 */

import { GameState } from "@/types/GameState";
import { Team } from "@/types/Team";

/** Team Re-rolls the team may still spend this half. */
export function teamRerollsLeft(state: GameState, team: Team): number {
  return Math.max(0, team.rerolls - (state.teamRerollsUsed?.[team.id] ?? 0));
}

/** Spend one of this half's Team Re-rolls; false when none remain. */
export function spendTeamReroll(state: GameState, team: Team): boolean {
  if (teamRerollsLeft(state, team) <= 0) return false;
  state.teamRerollsUsed ??= {};
  state.teamRerollsUsed[team.id] = (state.teamRerollsUsed[team.id] ?? 0) + 1;
  return true;
}

/** Half-time: every team gets its full purchased count back. */
export function replenishTeamRerolls(state: GameState): void {
  state.teamRerollsUsed = {};
}
