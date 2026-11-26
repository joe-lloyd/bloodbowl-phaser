import type { CompetitionFixture } from "./types";

export interface RoundPlan {
  next?: number;

  upcoming: number[];

  completed: number[];
}

export function roundPlan(fixtures: CompetitionFixture[]): RoundPlan {
  const rounds = [...new Set(fixtures.map((fixture) => fixture.round))].sort(
    (a, b) => a - b
  );
  const open = (round: number) =>
    fixtures.some(
      (fixture) => fixture.round === round && fixture.status !== "complete"
    );
  const [next, ...upcoming] = rounds.filter(open);
  return {
    ...(next !== undefined && { next }),
    upcoming,
    completed: rounds.filter((round) => !open(round)),
  };
}

export function roundFixtures(
  fixtures: CompetitionFixture[],
  round: number
): CompetitionFixture[] {
  return fixtures.filter((fixture) => fixture.round === round);
}
