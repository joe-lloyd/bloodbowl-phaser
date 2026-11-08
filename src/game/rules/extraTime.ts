/**
 * Extra Time and Penalties (2025 rulebook, p.87). A game that must have a
 * winner, such as a knockout cup tie, is not left level. Extra Time is
 * played like a normal half, but Team Re-rolls are not replenished; a roll
 * off decides who chooses to kick. If it is still level after that, a
 * Penalty Shoot-out of five roll-offs decides the game.
 */

import { GameState } from "../../types/GameState";
import { Team } from "../../types/Team";
import { DiceController } from "../controllers/DiceController";

export const SHOOTOUT_ROLL_OFFS = 5;

/** A knockout game whose score is level, so it cannot end yet. */
export function undecided(state: GameState, team1: Team, team2: Team): boolean {
  return (
    !!state.knockout &&
    (state.score[team1.id] ?? 0) === (state.score[team2.id] ?? 0)
  );
}

/** A roll-off (p.33): a D6 each, re-rolling ties. Returns the winner's id. */
export function rollOff(
  dice: DiceController,
  label: string,
  team1: Team,
  team2: Team
): string {
  for (;;) {
    const first = dice.rollD6(`${label} (${team1.name})`, team1.id);
    const second = dice.rollD6(`${label} (${team2.name})`, team2.id);
    if (first !== second) return first > second ? team1.id : team2.id;
  }
}

/** Five roll-offs; returns how many each team won, by team id. */
export function penaltyShootout(
  dice: DiceController,
  team1: Team,
  team2: Team
): Record<string, number> {
  const won: Record<string, number> = { [team1.id]: 0, [team2.id]: 0 };
  for (let kick = 1; kick <= SHOOTOUT_ROLL_OFFS; kick++) {
    won[rollOff(dice, `Penalty ${kick}`, team1, team2)]++;
  }
  return won;
}
