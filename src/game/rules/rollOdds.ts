/** A natural 1 fails and a natural 6 succeeds on a D6 test. */
export function d6Target(target: number, modifier = 0): number {
  return Math.max(2, Math.min(6, target - modifier));
}

export function d6Chance(needed: number): number {
  return (7 - d6Target(needed)) / 6;
}

export function percent(chance: number): string {
  return `${Math.round(chance * 100)}%`;
}
