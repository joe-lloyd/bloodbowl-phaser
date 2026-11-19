interface Square { x: number; y: number }

const NEIGHBORS = [
  [-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1],
] as const;

export function adjacentSquares(square: Square, bounds: { width: number; height: number }): Square[] {
  return NEIGHBORS.map(([dx, dy]) => ({ x: square.x + dx, y: square.y + dy }))
    .filter(({ x, y }) => x >= 0 && y >= 0 && x < bounds.width && y < bounds.height);
}

export function withinOneSquare(from: Square | undefined, to: Square | undefined): boolean {
  return Boolean(from && to && Math.max(Math.abs(from.x - to.x), Math.abs(from.y - to.y)) <= 1);
}

export function adjacentTo(from: Square | undefined, to: Square | undefined): boolean {
  return Boolean(from && to && Math.max(Math.abs(from.x - to.x), Math.abs(from.y - to.y)) === 1);
}
