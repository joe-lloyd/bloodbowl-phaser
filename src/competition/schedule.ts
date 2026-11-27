import type { CompetitionDoc, CompetitionFixture } from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;

export interface RoundWindow {
  round: number;
  opensAt: number;
  deadline: number;
}

function roundsInOrder(fixtures: CompetitionFixture[]): number[] {
  return [...new Set(fixtures.map((fixture) => fixture.round))].sort(
    (a, b) => a - b
  );
}

function finishedAt(fixtures: CompetitionFixture[]): number | null {
  if (fixtures.some((fixture) => fixture.status !== "complete")) return null;
  return Math.max(0, ...fixtures.map((fixture) => fixture.result?.completedAt ?? 0));
}

export function openRound(competition: CompetitionDoc): RoundWindow | null {
  const startedAt = competition.online?.startedAt;
  if (!competition.online || startedAt === undefined) return null;
  const roundMs = competition.online.roundDays * DAY_MS;
  let opensAt = startedAt;
  for (const round of roundsInOrder(competition.fixtures)) {
    const done = finishedAt(
      competition.fixtures.filter((fixture) => fixture.round === round)
    );
    if (done === null) return { round, opensAt, deadline: opensAt + roundMs };
    opensAt = Math.max(opensAt, done);
  }
  return null;
}

export function fixtureInOpenRound(
  competition: CompetitionDoc,
  fixture: CompetitionFixture
): boolean {
  return !competition.online || openRound(competition)?.round === fixture.round;
}

export function assertFixtureInOpenRound(
  competition: CompetitionDoc,
  fixture: CompetitionFixture
): void {
  if (fixtureInOpenRound(competition, fixture)) return;
  throw new Error(
    `Round ${String(fixture.round)} has not opened yet. Every game in the round before it has to finish first.`
  );
}

export function overdueEntrantIds(
  competition: CompetitionDoc,
  now: number
): string[] {
  const window = openRound(competition);
  if (!window || now <= window.deadline) return [];
  const humans = new Set(
    competition.entrants
      .filter((entrant) => !entrant.computerCoached && !entrant.withdrawn)
      .map((entrant) => entrant.id)
  );
  return [
    ...new Set(
      competition.fixtures
        .flatMap((fixture) =>
          fixture.round === window.round && fixture.status !== "complete"
            ? [fixture.homeEntrantId, fixture.awayEntrantId]
            : []
        )
        .filter((id): id is string => id !== null && humans.has(id))
    ),
  ];
}
