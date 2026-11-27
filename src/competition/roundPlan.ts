import type { GameType } from "../game/variants/gameTypes";
import type { CompetitionDoc, CompetitionFixture } from "./types";

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
  const [next, ...upcoming] = rounds.filter((round) => open(round));
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

export function roundGameType(
  fixtures: readonly CompetitionFixture[],
  round: number
): GameType | undefined {
  return fixtures.find((fixture) => fixture.round === round && fixture.gameType)
    ?.gameType;
}

export function revealNextRound(
  competition: CompetitionDoc,
  rollDie: (sides: number) => number
): CompetitionDoc {
  const pool = competition.gameTypePool;
  const { next } = roundPlan(competition.fixtures);
  if (!pool || next === undefined) return competition;
  if (roundGameType(competition.fixtures, next)) return competition;
  const gameType = pool[rollDie(pool.length) - 1];
  if (!gameType) return competition;
  return {
    ...competition,
    fixtures: competition.fixtures.map((fixture) =>
      fixture.round === next ? { ...fixture, gameType } : fixture
    ),
  };
}
