/**
 * Grid utility functions for Blood Bowl pitch
 */

export interface GridPosition {
  x: number;
  y: number;
}

/**
 * Convert grid coordinates to pixel coordinates
 */
export function gridToPixel(
  gridX: number,
  gridY: number,
  squareSize: number
): { x: number; y: number } {
  return {
    x: gridX * squareSize + squareSize / 2,
    y: gridY * squareSize + squareSize / 2,
  };
}

/**
 * Convert pixel coordinates to grid coordinates
 */
export function pixelToGrid(
  pixelX: number,
  pixelY: number,
  squareSize: number
): GridPosition {
  return {
    x: Math.floor(pixelX / squareSize),
    y: Math.floor(pixelY / squareSize),
  };
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
 * Check if position is in end zone
 */
export function isInEndZone(
  pos: GridPosition,
  height: number,
  teamSide: 1 | 2
): boolean {
  if (teamSide === 1) {
    return pos.y === 0; // Top end zone
  } else {
    return pos.y === height - 1; // Bottom end zone
  }
}
