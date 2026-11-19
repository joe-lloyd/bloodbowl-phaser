interface Square {
  x: number;
  y: number;
}

export const DIRS: readonly Square[] = [
  { x: 0, y: -1 },
  { x: 1, y: -1 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
  { x: -1, y: 1 },
  { x: -1, y: 0 },
  { x: -1, y: -1 },
];

function sign(v: number): number {
  if (v > 0) return 1;
  return v < 0 ? -1 : 0;
}

export function toCardinalIndex(dx: number, dy: number): number {
  const sx = sign(dx);
  const sy = sign(dy);
  if (sx !== 0 && Math.abs(dx) >= Math.abs(dy)) return sx > 0 ? 2 : 6;
  if (sy !== 0) return sy > 0 ? 4 : 0;
  return 2;
}

export function templateOffset(roll: number): number {
  if (roll <= 2) return -1;
  return roll <= 4 ? 0 : 1;
}
