export interface Tally {
  readonly teamId: string;
  readonly points: number;
  readonly touchdowns: number;
}

export interface Placing extends Tally {
  readonly place: number;
}

export function placings(tallies: readonly Tally[]): Placing[] {
  const placed = tallies.map((tally) => ({
    ...tally,
    place: 1 + tallies.filter((other) => other.points > tally.points).length,
  }));
  return placed.sort((a, b) => a.place - b.place);
}
