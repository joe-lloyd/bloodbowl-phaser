interface Square {
  x: number;
  y: number;
}

export function chebyshev(a: Square, b: Square): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}
