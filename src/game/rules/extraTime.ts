import { type GameState } from "../../types/GameState";
import { type Team } from "../../types/Team";
import { DiceController } from "../controllers/DiceController";
import { type PairSeating, pairTeams } from "../seating";

const SHOOTOUT_ROLL_OFFS = 5;

export function undecided(state: GameState, seating: PairSeating): boolean {
  const [home, away] = pairTeams(seating);
  return (
    !!state.knockout &&
    (state.score[home.id] ?? 0) === (state.score[away.id] ?? 0)
  );
}

export function rollOff(
  dice: DiceController,
  label: string,
  [home, away]: readonly [Team, Team]
): string {
  for (;;) {
    const first = dice.rollD6(`${label} (${home.name})`, home.id);
    const second = dice.rollD6(`${label} (${away.name})`, away.id);
    if (first !== second) return first > second ? home.id : away.id;
  }
}

export function penaltyShootout(
  dice: DiceController,
  seating: PairSeating
): Record<string, number> {
  const [home, away] = pairTeams(seating);
  const won: Record<string, number> = { [home.id]: 0, [away.id]: 0 };
  for (let kick = 1; kick <= SHOOTOUT_ROLL_OFFS; kick++) {
    const winner = rollOff(dice, `Penalty ${String(kick)}`, [home, away]);
    won[winner] = (won[winner] ?? 0) + 1;
  }
  return won;
}
