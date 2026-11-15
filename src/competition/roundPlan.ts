import type { CompetitionFixture } from "./types";

/**
 * How a league page orders its rounds: the round to play next first, the
 * rest of the season after it, and the rounds already played as history.
 * Round numbers are the fixtures' own; nothing is renumbered.
 */
export interface RoundPlan {
  /**
   * The earliest round with a game still to play (the same rule as
   * `currentRound` in simulateFixture.ts). A partly played round stays here
   * until its last game is in. Undefined once every game is complete.
   */
  next?: number;
  /** Rounds after `next` with a game still to play, earliest first. */
  upcoming: number[];
  /** Rounds whose games are all complete, earliest first. */
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
    ...(next === undefined ? {} : { next }),
    upcoming,
    completed: rounds.filter((round) => !open(round)),
  };
}

/** A round's games in the order the schedule lists them. */
export function roundFixtures(
  fixtures: CompetitionFixture[],
  round: number
): CompetitionFixture[] {
  return fixtures.filter((fixture) => fixture.round === round);
}
