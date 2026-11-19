export const requiredRoll = (target: number, modifier = 0): number =>
  Math.min(6, Math.max(2, target - modifier));

export const rollLabel = (name: string, target: number): string =>
  `${name}: ${String(target)}+`;
