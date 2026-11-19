import type { CompetitionFixture } from "./types";

export function indexBracket(fixtures: CompetitionFixture[]) {
  if (fixtures.length === 0) return null;
  const rounds = [...new Set(fixtures.map((fixture) => fixture.round))].sort(
    (a, b) => a - b
  );
  return {
    fixtures,
    rounds,
    firstRound: Math.min(...rounds),
    lastRound: Math.max(...rounds),
    byId: new Map(fixtures.map((fixture) => [fixture.id, fixture])),
    byRoundOrder: new Map(
      fixtures.map((fixture) => [
        `${String(fixture.round)}:${String(fixture.order)}`,
        fixture,
      ])
    ),
  };
}

export type BracketIndex = NonNullable<ReturnType<typeof indexBracket>>;
