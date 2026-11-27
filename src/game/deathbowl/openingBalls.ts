import type { DiceController } from "../controllers/DiceController";
import { d8Offset } from "../rules/ballFlight";
import { type BallId, clearBalls, placeBall } from "../rules/balls";
import type { Team } from "../../types/Team";
import type { GameState } from "../../types/GameState";
import type { PitchLayout, Square } from "../variants/pitchLayouts";

const sameSquare = (a: Square, b: Square) => a.x === b.x && a.y === b.y;

function centreSquare(
  layout: PitchLayout,
  rollD8: () => number,
  taken: readonly Square[]
): Square {
  const centre = { x: Math.floor(layout.cols / 2), y: Math.floor(layout.rows / 2) };
  const roll = () => {
    const offset = d8Offset(rollD8());
    return { x: centre.x + offset.x, y: centre.y + offset.y };
  };
  let square = roll();
  while (taken.some((other) => sameSquare(other, square))) square = roll();
  return square;
}

export function placeOpeningBalls(
  state: Pick<GameState, "balls">,
  layout: PitchLayout,
  dice: { count: 1 | 2; rollD8: (ball: BallId) => number }
): void {
  clearBalls(state, dice.count);
  const taken: Square[] = [];
  for (const { id } of state.balls) {
    const square = centreSquare(layout, () => dice.rollD8(id), taken);
    placeBall(state, id, square);
    taken.push(square);
  }
}

export function rollOff(dice: DiceController, teams: readonly Team[]): Team {
  const rolls = teams.map((team) => ({
    team,
    roll: dice.rollD6(`Roll-off (${team.name})`, team.id),
  }));
  const top = Math.max(...rolls.map(({ roll }) => roll));
  const [winner, ...tied] = rolls
    .filter(({ roll }) => roll === top)
    .map(({ team }) => team);
  if (!winner) throw new Error("A roll-off needs at least one team.");
  return tied.length === 0 ? winner : rollOff(dice, [winner, ...tied]);
}
