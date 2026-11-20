import type { DiceController } from "../controllers/DiceController";
import type { Square } from "../variants/pitchLayouts";
import {
  isOnPitch,
  isStandableSquare,
  isWallSquare,
  nearestFreeSquare,
  obstacleKindAt,
} from "../rules/pitchSquares";
import { DIRS, templateOffset, toCardinalIndex } from "./throwInTemplate";

export interface WallStrike {
  before: Square;
  wall: Square;
}

const hardSquare = (square: Square): boolean =>
  isWallSquare(square) || obstacleKindAt(square) === "market-stall";

export function firstWallOnPath(
  start: Square,
  path: readonly Square[]
): WallStrike | undefined {
  let before = start;
  for (const square of path) {
    if (hardSquare(square)) return { before, wall: square };
    if (!isOnPitch(square)) return undefined;
    before = square;
  }
  return undefined;
}

const canLandOn = (square: Square): boolean =>
  isStandableSquare(square) || obstacleKindAt(square) === "sewer-pit";

export function pushOffWall(
  dice: Pick<DiceController, "rollD6" | "rollD3">,
  { before, wall }: WallStrike
): Square {
  const facing = toCardinalIndex(before.x - wall.x, before.y - wall.y);
  const roll = dice.rollD6("Push Off the Wall Direction");
  const dir = DIRS[(facing + templateOffset(roll) + 8) % 8];
  if (!dir) throw new Error(`No direction for roll ${String(roll)}`);
  const distance = dice.rollD3("Push Off the Wall Distance");
  let at = before;
  for (let step = 0; step < distance; step++) {
    const next = { x: at.x + dir.x, y: at.y + dir.y };
    if (!canLandOn(next)) break;
    at = next;
  }
  return at;
}

export function clearOfStalls(square: Square): Square {
  if (obstacleKindAt(square) !== "market-stall") return square;
  return nearestFreeSquare(square, () => false) ?? square;
}

export function clearOfObstacles(square: Square): Square {
  if (obstacleKindAt(square) === undefined) return square;
  return nearestFreeSquare(square, () => false) ?? square;
}
