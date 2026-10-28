/**
 * Grid utility functions for Blood Bowl pitch
 */

export interface GridPosition {
  x: number;
  y: number;
}

/**
 * The board is drawn isometrically, with the same camera the player sprites
 * and the stadium were rendered with in Blender: orthographic, 30 degrees
 * above the ground and turned 45 degrees. One grid square is 2.8 m and the
 * renders use 25 px per metre, so a square's diagonal is 70 px and one step
 * along the grid moves half a 2:1 diamond on screen.
 *
 * Pixel coordinates are relative to the far corner of square (0, 0), the
 * pitch container's origin. Grid x runs down-right on screen, grid y
 * down-left.
 */
const SQUARE_PX = 70;
const HALF_W = SQUARE_PX * Math.SQRT1_2; // 49.5: screen x per grid step
const HALF_H = HALF_W / 2; // 24.7: screen y per grid step

/** Screen offset of one step along grid x, along grid y, and one metre up. */
export const ISO = {
  gx: { x: HALF_W, y: HALF_H },
  gy: { x: -HALF_W, y: HALF_H },
  upPerMetre: -25 * Math.cos(Math.PI / 6),
  /** A square's diamond on screen. */
  tileWidth: 2 * HALF_W,
  tileHeight: 2 * HALF_H,
} as const;

/** Pixel position of a point given in grid units (corners are whole numbers). */
export function gridPointToPixel(
  gridX: number,
  gridY: number
): { x: number; y: number } {
  return {
    x: (gridX - gridY) * HALF_W,
    y: (gridX + gridY) * HALF_H,
  };
}

/** Centre of a square on screen. */
export function gridToPixel(
  gridX: number,
  gridY: number
): { x: number; y: number } {
  return gridPointToPixel(gridX + 0.5, gridY + 0.5);
}

/** The square under a pixel, by inverting the projection. */
export function pixelToGrid(pixelX: number, pixelY: number): GridPosition {
  const u = pixelX / HALF_W; // gx - gy
  const v = pixelY / HALF_H; // gx + gy
  return { x: Math.floor((u + v) / 2), y: Math.floor((v - u) / 2) };
}

/** A square's four corners on screen, clockwise from the top, shrunk toward the centre by `inset` (0..0.5). */
export function squareCorners(
  gridX: number,
  gridY: number,
  inset = 0
): { x: number; y: number }[] {
  const a = inset;
  const b = 1 - inset;
  return [
    [a, a],
    [b, a],
    [b, b],
    [a, b],
  ].map(([dx, dy]) => gridPointToPixel(gridX + dx, gridY + dy));
}

/**
 * Calculate distance between two grid positions
 */
export function gridDistance(pos1: GridPosition, pos2: GridPosition): number {
  const dx = Math.abs(pos2.x - pos1.x);
  const dy = Math.abs(pos2.y - pos1.y);
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Calculate Manhattan distance (for movement)
 */
export function manhattanDistance(
  pos1: GridPosition,
  pos2: GridPosition
): number {
  return Math.abs(pos2.x - pos1.x) + Math.abs(pos2.y - pos1.y);
}

/**
 * Check if two positions are adjacent (including diagonals)
 */
export function areAdjacent(pos1: GridPosition, pos2: GridPosition): boolean {
  const dx = Math.abs(pos2.x - pos1.x);
  const dy = Math.abs(pos2.y - pos1.y);
  return dx <= 1 && dy <= 1 && dx + dy > 0;
}

/**
 * Get all adjacent positions (8 directions)
 */
export function getAdjacentPositions(pos: GridPosition): GridPosition[] {
  const adjacent: GridPosition[] = [];
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      if (dx === 0 && dy === 0) continue;
      adjacent.push({ x: pos.x + dx, y: pos.y + dy });
    }
  }
  return adjacent;
}

/**
 * Check if position is within grid bounds
 */
export function isInBounds(
  pos: GridPosition,
  width: number,
  height: number
): boolean {
  return pos.x >= 0 && pos.x < width && pos.y >= 0 && pos.y < height;
}

/**
 * Check if a position is the end zone the given team scores in.
 * Horizontal pitch orientation: team 1 defends x=0 and scores at x=width-1,
 * team 2 the reverse.
 */
export function isInEndZone(
  pos: GridPosition,
  width: number,
  scoringTeamSide: 1 | 2
): boolean {
  return scoringTeamSide === 1 ? pos.x === width - 1 : pos.x === 0;
}
