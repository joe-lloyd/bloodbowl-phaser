import type { DiceController } from "../controllers/DiceController";
import type { Square } from "../variants/pitchLayouts";
import { activeLayout } from "../variants/activeMatch";
import { isOnPitch, isWallSquare, obstacleKindAt } from "./pitchSquares";
import { d8Offset } from "./ballFlight";

type RicochetDice = Pick<DiceController, "rollD6" | "rollD8">;

export interface RicochetPath {
  wall: Square;
  path: Square[];
  last: Square;
  exit?: Square;
}

function missedWall(dice: RicochetDice, wall: Square): Square {
  const roll = dice.rollD6("Ricochet Pass Miss");
  const throwersRight = wall.y < 0 ? 1 : -1;
  const shift = roll <= 3 ? throwersRight : -throwersRight;
  const x = Math.min(activeLayout().cols - 1, Math.max(0, wall.x + shift));
  return { x, y: wall.y };
}

const plus = (a: Square, b: Square): Square => ({ x: a.x + b.x, y: a.y + b.y });

function deflect(at: Square, dir: Square): Square {
  if (isWallSquare(plus(at, dir))) return { x: dir.x, y: -dir.y };
  if (obstacleKindAt(plus(at, dir)) === "market-stall")
    return { x: -dir.x, y: -dir.y };
  return dir;
}

export function ricochetPath(
  dice: RicochetDice,
  { from, wall, accurate }: { from: Square; wall: Square; accurate: boolean }
): RicochetPath {
  const hit = accurate ? wall : missedWall(dice, wall);
  let dir = { x: Math.sign(hit.x - from.x), y: -Math.sign(hit.y - from.y) };
  const distance = dice.rollD6("Ricochet Pass Distance");
  const path: Square[] = [];
  let at = hit;
  for (let step = 0; step < distance; step++) {
    if (step > 0) dir = deflect(at, dir);
    const next = plus(at, dir);
    if (!isOnPitch(next))
      return { wall: hit, path, last: lastOf(path, hit), exit: next };
    if (obstacleKindAt(next) === "market-stall") break;
    at = next;
    path.push(at);
  }
  return { wall: hit, path, last: lastOf(path, hit) };
}

function lastOf(path: readonly Square[], wall: Square): Square {
  const beside = { x: wall.x, y: wall.y < 0 ? 0 : activeLayout().rows - 1 };
  return path.at(-1) ?? beside;
}

export function ricochetDrop(dice: RicochetDice, flight: RicochetPath): Square {
  if (flight.exit) return flight.exit;
  return plus(flight.last, d8Offset(dice.rollD8("Scatter")));
}
