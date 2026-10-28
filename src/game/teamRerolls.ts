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
 *
 * Inducements change the allowance: each Extra Team Training adds one, and
 * a Halfling Master Chef moves some from one team to the other for the
 * half. The tracker runs to 6 (P4), so a half never holds more than 6.
 */

import { GameState } from "@/types/GameState";
import { Team } from "@/types/Team";
import { Inducement } from "@/types/Inducements";
import { MAX_TEAM_REROLLS } from "./rules/sevensPrices";
import { inducementCount } from "./inducements/inventory";

/** The current half, as the Master Chef's swing is keyed. */
export function currentHalf(state: GameState): "h1" | "h2" {
  return state.turn.isHalf2 ? "h2" : "h1";
}

/** Team Re-rolls the team starts this half with, after inducements. */
function teamRerollsThisHalf(state: GameState, team: Team): number {
  const chef = state.inducements?.masterChef;
  const swing =
    chef?.half === currentHalf(state) ? chef.rerolls[team.id] ?? 0 : 0;
  const total =
    team.rerolls +
    inducementCount(state, team.id, Inducement.EXTRA_TEAM_TRAINING) +
    swing;
  return Math.min(MAX_TEAM_REROLLS, Math.max(0, total));
}

/** Team Re-rolls the team may still spend this half. */
export function teamRerollsLeft(state: GameState, team: Team): number {
  return Math.max(
    0,
    teamRerollsThisHalf(state, team) - (state.teamRerollsUsed?.[team.id] ?? 0)
  );
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
