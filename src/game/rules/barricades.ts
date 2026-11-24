import type { MoveStep } from "../../headless/protocol";
import { barricadeBetween } from "./pitchSquares";
import { JUMP_COST, routeSquares, type RouteStep } from "./jump";

interface Square {
  x: number;
  y: number;
}

export type Crossing = "safe" | "reckless";

export const SAFE_CROSSING_EXTRA = 2;

export const RECKLESS_CROSSING_TARGET = 2;

export function crossingAt({
  from,
  step,
  used,
  ma,
}: {
  from: Square;
  step: MoveStep;
  used: number;
  ma: number;
}): Crossing | null {
  if (!barricadeBetween(from, step)) return null;
  if (step.reckless) return "reckless";
  return used + 1 + SAFE_CROSSING_EXTRA <= ma ? "safe" : "reckless";
}

export function stepCost(crossing: Crossing | null): number {
  return crossing === "safe" ? 1 + SAFE_CROSSING_EXTRA : 1;
}

export function planCrossings(
  start: Square,
  path: readonly RouteStep[],
  { used, ma }: { used: number; ma: number }
): RouteStep[] {
  let spent = used;
  let from = start;
  return path.map((square, index) => {
    if (square.over) {
      from = square;
      spent += JUMP_COST;
      return square;
    }
    const after = routeSquares(path.slice(index + 1));
    const safe = spent + 1 + SAFE_CROSSING_EXTRA + after <= ma;
    const crossing = barricadeBetween(from, square);
    from = square;
    spent += crossing && safe ? 1 + SAFE_CROSSING_EXTRA : 1;
    return crossing && !safe
      ? { x: square.x, y: square.y, reckless: true }
      : { x: square.x, y: square.y };
  });
}
