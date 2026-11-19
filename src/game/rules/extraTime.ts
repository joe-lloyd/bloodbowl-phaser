import { type GameState } from "../../types/GameState";
import { type Team } from "../../types/Team";
import { DiceController } from "../controllers/DiceController";

const SHOOTOUT_ROLL_OFFS = 5;

export function undecided(state: GameState, team1: Team, team2: Team): boolean {
  return (
    !!state.knockout &&
    (state.score[team1.id] ?? 0) === (state.score[team2.id] ?? 0)
  );
}

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

export function penaltyShootout(
  dice: DiceController,
  team1: Team,
  team2: Team
): Record<string, number> {
  const won: Record<string, number> = { [team1.id]: 0, [team2.id]: 0 };
  for (let kick = 1; kick <= SHOOTOUT_ROLL_OFFS; kick++) {
    won[rollOff(dice, `Penalty ${String(kick)}`, team1, team2)]++;
  }
  return won;
}
