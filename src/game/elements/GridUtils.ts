export interface GridPosition {
  x: number;
  y: number;
}

const SQUARE_PX = 70;
const HALF_W = SQUARE_PX * Math.SQRT1_2;
const HALF_H = HALF_W / 2;

export const ISO = {
  gx: { x: HALF_W, y: HALF_H },
  gy: { x: -HALF_W, y: HALF_H },
  upPerMetre: -25 * Math.cos(Math.PI / 6),

  tileWidth: 2 * HALF_W,
  tileHeight: 2 * HALF_H,
} as const;

export function gridPointToPixel(
  gridX: number,
  gridY: number
): { x: number; y: number } {
  return {
    x: (gridX - gridY) * HALF_W,
    y: (gridX + gridY) * HALF_H,
  };
}

export function gridToPixel(
  gridX: number,
  gridY: number
): { x: number; y: number } {
  return gridPointToPixel(gridX + 0.5, gridY + 0.5);
}

export function pixelToGrid(pixelX: number, pixelY: number): GridPosition {
  const u = pixelX / HALF_W;
  const v = pixelY / HALF_H;
  return { x: Math.floor((u + v) / 2), y: Math.floor((v - u) / 2) };
}

export function squareCorners(
  gridX: number,
  gridY: number,
  inset = 0
): { x: number; y: number }[] {
  const a = inset;
  const b = 1 - inset;
  return (
    [
      [a, a],
      [b, a],
      [b, b],
      [a, b],
    ] as const
  ).map(([dx, dy]) => gridPointToPixel(gridX + dx, gridY + dy));
}

export function areAdjacent(pos1: GridPosition, pos2: GridPosition): boolean {
  const dx = Math.abs(pos2.x - pos1.x);
  const dy = Math.abs(pos2.y - pos1.y);
  return dx <= 1 && dy <= 1 && dx + dy > 0;
}

export function isInEndZone(
  pos: GridPosition,
  width: number,
  scoringTeamSide: 1 | 2
): boolean {
  return scoringTeamSide === 1 ? pos.x === width - 1 : pos.x === 0;
}
