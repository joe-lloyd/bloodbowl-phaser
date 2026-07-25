import {
  CompetitionEntrant,
  CompetitionFixture,
  FixtureResult,
  LeagueDoc,
  LeaguePoints,
  Standing,
  TournamentDoc,
} from "./types";

function seeded(entrants: CompetitionEntrant[]): CompetitionEntrant[] {
  return [...entrants].sort(
    (a, b) =>
      a.seed - b.seed ||
      a.name.localeCompare(b.name) ||
      a.id.localeCompare(b.id)
  );
}

export function seedEntrants(
  entrants: Omit<CompetitionEntrant, "seed">[]
): CompetitionEntrant[] {
  return entrants.map((entrant, index) => ({ ...entrant, seed: index + 1 }));
}

function seedOrder(size: number): number[] {
  if (size === 1) return [1];
  let order = [1, 2];
  for (let bracketSize = 4; bracketSize <= size; bracketSize *= 2) {
    const mirror = bracketSize + 1;
    order = order.flatMap((seed) => [seed, mirror - seed]);
  }
  return order;
}

function fixtureState(
  homeEntrantId: string | null,
  awayEntrantId: string | null
): CompetitionFixture["status"] {
  return homeEntrantId && awayEntrantId ? "ready" : "scheduled";
}

function advanceWinner(
  fixtures: CompetitionFixture[],
  fixture: CompetitionFixture,
  winnerEntrantId: string
): void {
  if (!fixture.nextFixtureId || !fixture.nextSlot) return;
  const next = fixtures.find(
    (candidate) => candidate.id === fixture.nextFixtureId
  );
  if (!next) return;
  if (fixture.nextSlot === "home") next.homeEntrantId = winnerEntrantId;
  else next.awayEntrantId = winnerEntrantId;
  next.status = fixtureState(next.homeEntrantId, next.awayEntrantId);
}

function resolveByes(fixtures: CompetitionFixture[]): void {
  let changed = true;
  while (changed) {
    changed = false;
    for (const fixture of fixtures) {
      if (fixture.status === "complete") continue;
      const entrantId = fixture.homeEntrantId ?? fixture.awayEntrantId;
      if (!entrantId || (fixture.homeEntrantId && fixture.awayEntrantId))
        continue;
      const sourcesComplete =
        !fixture.sourceFixtureIds?.length ||
        fixture.sourceFixtureIds.every(
          (sourceId) =>
            fixtures.find((candidate) => candidate.id === sourceId)?.status ===
            "complete"
        );
      if (!sourcesComplete) continue;

      fixture.status = "complete";
      fixture.result = {
        homeScore: 0,
        awayScore: 0,
        winnerEntrantId: entrantId,
        completedAt: 0,
        bye: true,
      };
      advanceWinner(fixtures, fixture, entrantId);
      changed = true;
    }
  }
}

export function generateSingleElimination(
  entrants: CompetitionEntrant[]
): CompetitionFixture[] {
  if (entrants.length < 2) {
    throw new Error("A tournament needs at least two entrants.");
  }

  const ordered = seeded(entrants);
  const bracketSize = 2 ** Math.ceil(Math.log2(ordered.length));
  const rounds = Math.log2(bracketSize);
  const slots = seedOrder(bracketSize).map(
    (seedNumber) => ordered[seedNumber - 1]?.id ?? null
  );
  const fixtures: CompetitionFixture[] = [];
  const roundFixtures: CompetitionFixture[][] = [];

  for (let round = 1; round <= rounds; round++) {
    const matchCount = bracketSize / 2 ** round;
    const matches: CompetitionFixture[] = [];
    for (let order = 1; order <= matchCount; order++) {
      const id = `round-${round}-match-${order}`;
      const homeEntrantId = round === 1 ? slots[(order - 1) * 2] : null;
      const awayEntrantId = round === 1 ? slots[(order - 1) * 2 + 1] : null;
      const sourceFixtureIds =
        round === 1
          ? undefined
          : [
              `round-${round - 1}-match-${order * 2 - 1}`,
              `round-${round - 1}-match-${order * 2}`,
            ];
      matches.push({
        id,
        round,
        order,
        homeEntrantId,
        awayEntrantId,
        status: fixtureState(homeEntrantId, awayEntrantId),
        sourceFixtureIds,
        nextFixtureId:
          round < rounds
            ? `round-${round + 1}-match-${Math.ceil(order / 2)}`
            : undefined,
        nextSlot: round < rounds ? (order % 2 ? "home" : "away") : undefined,
      });
    }
    roundFixtures.push(matches);
    fixtures.push(...matches);
  }

  resolveByes(fixtures);
  return fixtures;
}

/**
 * Fill in bracket linkage missing from tournaments generated before it was
 * recorded, derived from the round/order convention: round r order o is fed by
 * round r-1 orders 2o-1 and 2o, and advances into round r+1 order ceil(o/2).
 *
 * This is not only cosmetic. `advanceWinner` returns early without a
 * `nextFixtureId`, so a bracket lacking the linkage could never progress past
 * its first round. Mutates in place; returns true when anything was repaired.
 */
export function repairBracketLinkage(fixtures: CompetitionFixture[]): boolean {
  const rounds = [...new Set(fixtures.map((f) => f.round))].sort(
    (a, b) => a - b
  );
  if (rounds.length === 0) return false;
  const firstRound = rounds[0];
  const lastRound = rounds[rounds.length - 1];
  const byRoundOrder = new Map(
    fixtures.map((f) => [`${f.round}:${f.order}`, f])
  );
  let repaired = false;

  for (const fixture of fixtures) {
    if (fixture.round > firstRound && !fixture.sourceFixtureIds?.length) {
      const sources = [
        byRoundOrder.get(`${fixture.round - 1}:${fixture.order * 2 - 1}`),
        byRoundOrder.get(`${fixture.round - 1}:${fixture.order * 2}`),
      ].filter((f): f is CompetitionFixture => !!f);
      if (sources.length) {
        fixture.sourceFixtureIds = sources.map((source) => source.id);
        repaired = true;
      }
    }
    if (fixture.round < lastRound && !fixture.nextFixtureId) {
      const next = byRoundOrder.get(
        `${fixture.round + 1}:${Math.ceil(fixture.order / 2)}`
      );
      if (next) {
        fixture.nextFixtureId = next.id;
        fixture.nextSlot = fixture.order % 2 ? "home" : "away";
        repaired = true;
      }
    }
  }
  return repaired;
}

export function generateRoundRobin(
  entrants: CompetitionEntrant[]
): CompetitionFixture[] {
  if (entrants.length < 2) {
    throw new Error("A competition needs at least two entrants.");
  }

  const ids: Array<string | null> = seeded(entrants).map(
    (entrant) => entrant.id
  );
  if (ids.length % 2) ids.push(null);
  const rounds = ids.length - 1;
  const fixtures: CompetitionFixture[] = [];
  let rotation = [...ids];

  for (let round = 1; round <= rounds; round++) {
    let order = 1;
    for (let i = 0; i < rotation.length / 2; i++) {
      let home = rotation[i];
      let away = rotation[rotation.length - 1 - i];
      if (!home || !away) continue;
      if ((round + i) % 2 === 0) [home, away] = [away, home];
      fixtures.push({
        id: `round-${round}-match-${order}`,
        round,
        order,
        homeEntrantId: home,
        awayEntrantId: away,
        status: "ready",
      });
      order++;
    }
    rotation = [
      rotation[0],
      rotation[rotation.length - 1],
      ...rotation.slice(1, -1),
    ];
  }

  return fixtures;
}

export function computeStandings(
  entrants: CompetitionEntrant[],
  fixtures: CompetitionFixture[],
  points: LeaguePoints = { win: 3, draw: 1, loss: 0 }
): Standing[] {
  const table = new Map<string, Standing>(
    entrants.map((entrant) => [
      entrant.id,
      {
        entrantId: entrant.id,
        played: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        scoreFor: 0,
        scoreAgainst: 0,
        scoreDifference: 0,
        points: 0,
      },
    ])
  );

  for (const fixture of fixtures) {
    if (
      fixture.status !== "complete" ||
      !fixture.result ||
      fixture.result.bye ||
      !fixture.homeEntrantId ||
      !fixture.awayEntrantId
    ) {
      continue;
    }
    const home = table.get(fixture.homeEntrantId);
    const away = table.get(fixture.awayEntrantId);
    if (!home || !away) continue;
    home.played++;
    away.played++;
    home.scoreFor += fixture.result.homeScore;
    home.scoreAgainst += fixture.result.awayScore;
    away.scoreFor += fixture.result.awayScore;
    away.scoreAgainst += fixture.result.homeScore;

    if (fixture.result.homeScore > fixture.result.awayScore) {
      home.wins++;
      away.losses++;
      home.points += points.win;
      away.points += points.loss;
    } else if (fixture.result.awayScore > fixture.result.homeScore) {
      away.wins++;
      home.losses++;
      away.points += points.win;
      home.points += points.loss;
    } else {
      home.draws++;
      away.draws++;
      home.points += points.draw;
      away.points += points.draw;
    }
  }

  for (const standing of table.values()) {
    standing.scoreDifference = standing.scoreFor - standing.scoreAgainst;
  }
  const names = new Map(entrants.map((entrant) => [entrant.id, entrant.name]));
  return [...table.values()].sort(
    (a, b) =>
      b.points - a.points ||
      b.scoreDifference - a.scoreDifference ||
      b.scoreFor - a.scoreFor ||
      (names.get(a.entrantId) ?? "").localeCompare(names.get(b.entrantId) ?? "")
  );
}

function completedResult(
  homeEntrantId: string,
  awayEntrantId: string,
  homeScore: number,
  awayScore: number,
  allowDraw: boolean
): FixtureResult {
  if (!Number.isInteger(homeScore) || !Number.isInteger(awayScore)) {
    throw new Error("Scores must be whole numbers.");
  }
  if (homeScore < 0 || awayScore < 0) {
    throw new Error("Scores cannot be negative.");
  }
  if (!allowDraw && homeScore === awayScore) {
    throw new Error("Elimination fixtures require a winner.");
  }
  return {
    homeScore,
    awayScore,
    winnerEntrantId:
      homeScore === awayScore
        ? undefined
        : homeScore > awayScore
          ? homeEntrantId
          : awayEntrantId,
    completedAt: Date.now(),
  };
}

export function recordTournamentResult(
  tournament: TournamentDoc,
  fixtureId: string,
  homeScore: number,
  awayScore: number
): TournamentDoc {
  const next: TournamentDoc = structuredClone(tournament);
  const fixture = next.fixtures.find((candidate) => candidate.id === fixtureId);
  if (!fixture || !fixture.homeEntrantId || !fixture.awayEntrantId) {
    throw new Error("Fixture is not ready.");
  }
  if (fixture.status === "complete")
    throw new Error("Fixture is already complete.");

  fixture.result = completedResult(
    fixture.homeEntrantId,
    fixture.awayEntrantId,
    homeScore,
    awayScore,
    next.format === "round-robin"
  );
  fixture.status = "complete";

  if (next.format === "single-elimination" && fixture.result.winnerEntrantId) {
    advanceWinner(next.fixtures, fixture, fixture.result.winnerEntrantId);
    resolveByes(next.fixtures);
    if (!fixture.nextFixtureId) {
      next.championEntrantId = fixture.result.winnerEntrantId;
    }
  }

  next.standings = computeStandings(next.entrants, next.fixtures);
  const allComplete = next.fixtures.every(
    (candidate) => candidate.status === "complete"
  );
  next.status = allComplete ? "complete" : "active";
  if (
    allComplete &&
    next.format === "round-robin" &&
    next.standings.length > 0
  ) {
    next.championEntrantId = next.standings[0].entrantId;
  }
  next.updatedAt = Date.now();
  return next;
}

export function recordLeagueResult(
  league: LeagueDoc,
  fixtureId: string,
  homeScore: number,
  awayScore: number
): LeagueDoc {
  const next: LeagueDoc = structuredClone(league);
  const fixture = next.fixtures.find((candidate) => candidate.id === fixtureId);
  if (!fixture || !fixture.homeEntrantId || !fixture.awayEntrantId) {
    throw new Error("Fixture is not ready.");
  }
  if (fixture.status === "complete")
    throw new Error("Fixture is already complete.");

  fixture.result = completedResult(
    fixture.homeEntrantId,
    fixture.awayEntrantId,
    homeScore,
    awayScore,
    true
  );
  fixture.status = "complete";
  next.standings = computeStandings(next.entrants, next.fixtures, next.points);
  next.status = next.fixtures.every(
    (candidate) => candidate.status === "complete"
  )
    ? "complete"
    : "active";
  next.updatedAt = Date.now();
  return next;
}
