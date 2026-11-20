import type { PitchLayout, Square } from "../variants/pitchLayouts";

export interface WallHit {
  x: number;
  y: number;
}

export function wallHitFromSquare(
  layout: Pick<PitchLayout, "rows" | "walledSidelines">,
  square: Square
): WallHit | null {
  if (!layout.walledSidelines) return null;
  if (square.y < 0) return { x: square.x + 0.5, y: 0 };
  if (square.y >= layout.rows) return { x: square.x + 0.5, y: layout.rows };
  return null;
}

export function wallHitFromThrowIn(
  layout: Pick<PitchLayout, "rows" | "walledSidelines">,
  lastSquareIn: Square
): WallHit | null {
  if (lastSquareIn.y === 0)
    return wallHitFromSquare(layout, { ...lastSquareIn, y: -1 });
  if (lastSquareIn.y === layout.rows - 1)
    return wallHitFromSquare(layout, { ...lastSquareIn, y: layout.rows });
  return null;
}
