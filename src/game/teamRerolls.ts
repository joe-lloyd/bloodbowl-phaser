import { type GameState } from "@/types/GameState";
import { type Team } from "@/types/Team";
import { Inducement } from "@/types/Inducements";
import { MAX_TEAM_REROLLS } from "./rules/sevensPrices";
import { inducementCount } from "./inducements/inventory";

export function currentHalf(state: GameState): "h1" | "h2" {
  return state.turn.isHalf2 ? "h2" : "h1";
}

function teamRerollsThisHalf(state: GameState, team: Team): number {
  const chef = state.inducements?.masterChef;
  const swing =
    chef?.half === currentHalf(state) ? (chef.rerolls[team.id] ?? 0) : 0;
  const total =
    team.rerolls +
    inducementCount(state, team.id, Inducement.EXTRA_TEAM_TRAINING) +
    swing;
  return Math.min(MAX_TEAM_REROLLS, Math.max(0, total));
}

export function teamRerollsLeft(state: GameState, team: Team): number {
  return Math.max(
    0,
    teamRerollsThisHalf(state, team) - (state.teamRerollsUsed?.[team.id] ?? 0)
  );
}

export function spendTeamReroll(state: GameState, team: Team): boolean {
  if (teamRerollsLeft(state, team) <= 0) return false;
  state.teamRerollsUsed ??= {};
  state.teamRerollsUsed[team.id] = (state.teamRerollsUsed[team.id] ?? 0) + 1;
  return true;
}

export function replenishTeamRerolls(state: GameState): void {
  state.teamRerollsUsed = {};
}
