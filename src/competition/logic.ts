import { indexBracket } from "./bracketIndex";
import {
  type CompetitionEntrant,
  type CompetitionFixture,
  type CompetitionDoc,
  type CompetitionStatus,
  type FixtureResult,
  type LeagueDoc,
  type LeaguePoints,
  type PenaltyShootout,
  type Standing,
  type TournamentDoc,
} from "./types";

const SINGLE_ELIMINATION = "single-elimination";

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

function byeWinner(
  fixture: CompetitionFixture,
  fixtures: CompetitionFixture[]
): string | undefined {
  const entrantId = fixture.homeEntrantId ?? fixture.awayEntrantId;
  if (
    fixture.status === "complete" ||
    !entrantId ||
    (fixture.homeEntrantId && fixture.awayEntrantId)
  )
    return undefined;
  const sourcesComplete = (fixture.sourceFixtureIds ?? []).every(
    (sourceId) =>
      fixtures.find((candidate) => candidate.id === sourceId)?.status ===
      "complete"
  );
  return sourcesComplete ? entrantId : undefined;
}

function resolveByes(fixtures: CompetitionFixture[]): void {
  let changed = true;
  while (changed) {
    changed = false;
    for (const fixture of fixtures) {
      const entrantId = byeWinner(fixture, fixtures);
      if (!entrantId) continue;
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

function bracketFixture({
  round,
  order,
  rounds,
  slots,
}: {
  round: number;
  order: number;
  rounds: number;
  slots: (string | null)[];
}): CompetitionFixture {
  const id = `round-${String(round)}-match-${String(order)}`;
  const homeEntrantId = round === 1 ? (slots[(order - 1) * 2] ?? null) : null;
  const awayEntrantId =
    round === 1 ? (slots[(order - 1) * 2 + 1] ?? null) : null;
  const sourceFixtureIds =
    round === 1
      ? undefined
      : [
          `round-${String(round - 1)}-match-${String(order * 2 - 1)}`,
          `round-${String(round - 1)}-match-${String(order * 2)}`,
        ];
  return {
    id,
    round,
    order,
    homeEntrantId,
    awayEntrantId,
    status: fixtureState(homeEntrantId, awayEntrantId),
    ...(sourceFixtureIds === undefined
      ? {}
      : { sourceFixtureIds: sourceFixtureIds }),
    ...(round < rounds
      ? {
          nextFixtureId: `round-${String(round + 1)}-match-${String(Math.ceil(order / 2))}`,
          nextSlot: order % 2 ? "home" : "away",
        }
      : {}),
  };
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
      matches.push(bracketFixture({ round, order, rounds, slots }));
    }
    roundFixtures.push(matches);
    fixtures.push(...matches);
  }

  resolveByes(fixtures);
  return fixtures;
}

export function repairBracketLinkage(fixtures: CompetitionFixture[]): boolean {
  const index = indexBracket(fixtures);
  if (!index) return false;
  const { firstRound, lastRound, byRoundOrder } = index;
  let repaired = false;

  for (const fixture of fixtures) {
    const sources =
      fixture.round > firstRound && repairSources(fixture, byRoundOrder);
    const next = fixture.round < lastRound && repairNext(fixture, byRoundOrder);
    if (sources || next) repaired = true;
  }
  return repaired;
}

function repairSources(
  fixture: CompetitionFixture,
  byRoundOrder: Map<string, CompetitionFixture>
): boolean {
  if (fixture.sourceFixtureIds?.length) return false;
  const sources = [
    byRoundOrder.get(
      `${String(fixture.round - 1)}:${String(fixture.order * 2 - 1)}`
    ),
    byRoundOrder.get(
      `${String(fixture.round - 1)}:${String(fixture.order * 2)}`
    ),
  ].filter((f): f is CompetitionFixture => !!f);
  if (!sources.length) return false;
  fixture.sourceFixtureIds = sources.map((source) => source.id);
  return true;
}

function repairNext(
  fixture: CompetitionFixture,
  byRoundOrder: Map<string, CompetitionFixture>
): boolean {
  if (fixture.nextFixtureId) return false;
  const next = byRoundOrder.get(
    `${String(fixture.round + 1)}:${String(Math.ceil(fixture.order / 2))}`
  );
  if (!next) return false;
  fixture.nextFixtureId = next.id;
  fixture.nextSlot = fixture.order % 2 ? "home" : "away";
  return true;
}

function rotateRoundRobin(rotation: (string | null)[]): (string | null)[] {
  const [fixed, ...moving] = rotation;
  if (fixed === undefined) return [];
  const last = moving.pop();
  return [fixed, ...(last === undefined ? [] : [last]), ...moving];
}

export function generateRoundRobin(
  entrants: CompetitionEntrant[]
): CompetitionFixture[] {
  if (entrants.length < 2) {
    throw new Error("A competition needs at least two entrants.");
  }

  const ids: (string | null)[] = seeded(entrants).map((entrant) => entrant.id);
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
        id: `round-${String(round)}-match-${String(order)}`,
        round,
        order,
        homeEntrantId: home,
        awayEntrantId: away,
        status: "ready",
      });
      order++;
    }
    rotation = rotateRoundRobin(rotation);
  }

  return fixtures;
}

function emptyStanding(entrantId: string): Standing {
  return {
    entrantId,
    played: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    scoreFor: 0,
    scoreAgainst: 0,
    scoreDifference: 0,
    points: 0,
  };
}

function isPlayedFixture(
  fixture: CompetitionFixture
): fixture is CompetitionFixture & {
  homeEntrantId: string;
  awayEntrantId: string;
  result: FixtureResult;
} {
  return (
    fixture.status === "complete" &&
    fixture.result !== undefined &&
    !fixture.result.bye &&
    !fixture.result.walkover &&
    Boolean(fixture.homeEntrantId && fixture.awayEntrantId)
  );
}

function recordScore(
  standing: Standing,
  scored: number,
  conceded: number
): void {
  standing.played++;
  standing.scoreFor += scored;
  standing.scoreAgainst += conceded;
}

function recordWin(
  winner: Standing,
  loser: Standing,
  points: LeaguePoints
): void {
  winner.wins++;
  loser.losses++;
  winner.points += points.win;
  loser.points += points.loss;
}

function recordDraw(
  home: Standing,
  away: Standing,
  points: LeaguePoints
): void {
  for (const standing of [home, away]) {
    standing.draws++;
    standing.points += points.draw;
  }
}

function recordScoreline({
  home,
  away,
  result,
  points,
}: {
  home: Standing;
  away: Standing;
  result: FixtureResult;
  points: LeaguePoints;
}): void {
  recordScore(home, result.homeScore, result.awayScore);
  recordScore(away, result.awayScore, result.homeScore);
  const lead = homeLead(result);
  if (lead === 0) {
    recordDraw(home, away, points);
    return;
  }
  if (lead > 0) recordWin(home, away, points);
  else recordWin(away, home, points);
}

export function computeStandings(
  entrants: CompetitionEntrant[],
  fixtures: CompetitionFixture[],
  points: LeaguePoints = { win: 3, draw: 1, loss: 0 }
): Standing[] {
  const table = new Map<string, Standing>(
    entrants.map((entrant) => [entrant.id, emptyStanding(entrant.id)])
  );
  for (const fixture of fixtures) {
    if (!isPlayedFixture(fixture)) continue;
    const home = table.get(fixture.homeEntrantId);
    const away = table.get(fixture.awayEntrantId);
    if (!home || !away) continue;
    recordScoreline({ home, away, result: fixture.result, points });
  }
  for (const standing of table.values())
    standing.scoreDifference = standing.scoreFor - standing.scoreAgainst;
  const names = new Map(entrants.map((entrant) => [entrant.id, entrant.name]));
  return [...table.values()].sort(
    (a, b) =>
      b.points - a.points ||
      b.scoreDifference - a.scoreDifference ||
      b.scoreFor - a.scoreFor ||
      (names.get(a.entrantId) ?? "").localeCompare(names.get(b.entrantId) ?? "")
  );
}

function homeLead(result: Omit<FixtureResult, "completedAt">): number {
  const { homeScore, awayScore, penalties } = result;
  return (
    homeScore - awayScore || (penalties ? penalties.home - penalties.away : 0)
  );
}

const SHOOTOUT_ROLL_OFFS = 5;

function checkPenalties(
  { homeScore, awayScore }: Pick<FixtureResult, "homeScore" | "awayScore">,
  allowDraw: boolean,
  { home, away }: PenaltyShootout
): void {
  if (allowDraw || homeScore !== awayScore) {
    throw new Error("Penalties only decide a knockout game left level.");
  }
  if (
    !Number.isInteger(home) ||
    !Number.isInteger(away) ||
    home < 0 ||
    away < 0 ||
    home + away !== SHOOTOUT_ROLL_OFFS
  ) {
    throw new Error(
      "A Penalty Shoot-out is five roll-offs, each won by one side."
    );
  }
}

function checkScores(homeScore: number, awayScore: number): void {
  if (!Number.isInteger(homeScore) || !Number.isInteger(awayScore)) {
    throw new Error("Scores must be whole numbers.");
  }
  if (homeScore < 0 || awayScore < 0) {
    throw new Error("Scores cannot be negative.");
  }
}

function completedResult({
  homeEntrantId,
  awayEntrantId,
  homeScore,
  awayScore,
  allowDraw,
  penalties,
}: {
  homeEntrantId: string;
  awayEntrantId: string;
  homeScore: number;
  awayScore: number;
  allowDraw: boolean;
  penalties?: PenaltyShootout;
}): FixtureResult {
  checkScores(homeScore, awayScore);
  if (penalties) {
    checkPenalties({ homeScore, awayScore }, allowDraw, penalties);
  } else if (!allowDraw && homeScore === awayScore) {
    throw new Error(
      "A knockout game left level is decided on Penalties: enter the shoot-out."
    );
  }
  const result = { homeScore, awayScore, ...(penalties ? { penalties } : {}) };
  const lead = homeLead(result);
  return {
    ...result,
    ...(lead === 0
      ? {}
      : { winnerEntrantId: lead > 0 ? homeEntrantId : awayEntrantId }),
    completedAt: Date.now(),
  };
}

function competitionStatus(
  current: CompetitionStatus,
  allComplete: boolean
): CompetitionStatus {
  if (current === "draft") return "draft";
  return allComplete ? "complete" : "active";
}

function tournamentChampion(
  tournament: TournamentDoc,
  standings: Standing[],
  allComplete: boolean
): string | undefined {
  if (tournament.format === SINGLE_ELIMINATION)
    return tournament.fixtures.find((fixture) => !fixture.nextFixtureId)?.result
      ?.winnerEntrantId;
  return allComplete ? standings[0]?.entrantId : undefined;
}

export function withResultsFromFixtures(
  competition: CompetitionDoc
): CompetitionDoc {
  const standings = computeStandings(
    competition.entrants,
    competition.fixtures,
    competition.type === "league" ? competition.points : undefined
  );
  const allComplete =
    competition.fixtures.length > 0 &&
    competition.fixtures.every((fixture) => fixture.status === "complete");
  const next = {
    ...competition,
    standings,
    status: competitionStatus(competition.status, allComplete),
  };
  if (next.type === "tournament") {
    const champion = tournamentChampion(next, standings, allComplete);
    if (champion) next.championEntrantId = champion;
    else delete next.championEntrantId;
  }
  return next;
}

export function walkOverNext(
  competition: CompetitionDoc
): CompetitionDoc | null {
  const next = structuredClone(competition);
  const withdrawnIndex = (entrantId: string | null) =>
    competition.entrants.findIndex(
      (entrant) => entrant.id === entrantId && entrant.withdrawn
    );
  const open = next.fixtures
    .filter(
      (fixture) =>
        fixture.status !== "complete" &&
        fixture.homeEntrantId &&
        fixture.awayEntrantId &&
        (withdrawnIndex(fixture.homeEntrantId) >= 0 ||
          withdrawnIndex(fixture.awayEntrantId) >= 0)
    )
    .sort((a, b) => a.round - b.round || a.order - b.order)[0];
  if (!open?.homeEntrantId || !open.awayEntrantId) return null;

  const fixture = open;
  const homeOut = withdrawnIndex(open.homeEntrantId);

  const loserIndex =
    homeOut >= 0 ? homeOut : withdrawnIndex(open.awayEntrantId);
  const winner = homeOut >= 0 ? open.awayEntrantId : open.homeEntrantId;
  fixture.status = "complete";
  fixture.result = {
    homeScore: 0,
    awayScore: 0,
    winnerEntrantId: winner,
    completedAt: Date.now(),
    walkover: { withdrawnEntrantIndex: loserIndex },
  };
  if (next.type === "tournament" && next.format === SINGLE_ELIMINATION) {
    advanceWinner(next.fixtures, fixture, winner);
    resolveByes(next.fixtures);
  }
  return { ...withResultsFromFixtures(next), updatedAt: Date.now() };
}

function advanceTournament(
  tournament: TournamentDoc,
  fixture: CompetitionFixture,
  result: FixtureResult
): void {
  if (tournament.format !== SINGLE_ELIMINATION || !result.winnerEntrantId)
    return;
  advanceWinner(tournament.fixtures, fixture, result.winnerEntrantId);
  resolveByes(tournament.fixtures);
  if (!fixture.nextFixtureId)
    tournament.championEntrantId = result.winnerEntrantId;
}

function completeFixture(
  fixtures: CompetitionFixture[],
  {
    fixtureId,
    ...score
  }: {
    fixtureId: string;
    homeScore: number;
    awayScore: number;
    allowDraw: boolean;
    penalties?: PenaltyShootout;
  }
): { fixture: CompetitionFixture; result: FixtureResult } {
  const fixture = fixtures.find((candidate) => candidate.id === fixtureId);
  if (!fixture?.homeEntrantId || !fixture.awayEntrantId) {
    throw new Error("Fixture is not ready.");
  }
  if (fixture.status === "complete")
    throw new Error("Fixture is already complete.");

  const result = completedResult({
    homeEntrantId: fixture.homeEntrantId,
    awayEntrantId: fixture.awayEntrantId,
    ...score,
  });
  fixture.result = result;
  fixture.status = "complete";
  return { fixture, result };
}

export function recordTournamentResult({
  tournament,
  fixtureId,
  homeScore,
  awayScore,
  penalties,
}: {
  tournament: TournamentDoc;
  fixtureId: string;
  homeScore: number;
  awayScore: number;
  penalties?: PenaltyShootout;
}): TournamentDoc {
  const next: TournamentDoc = structuredClone(tournament);
  const { fixture, result } = completeFixture(next.fixtures, {
    fixtureId,
    homeScore,
    awayScore,
    allowDraw: next.format === "round-robin",
    ...(penalties === undefined ? {} : { penalties }),
  });

  advanceTournament(next, fixture, result);

  next.standings = computeStandings(next.entrants, next.fixtures);
  const allComplete = next.fixtures.every(
    (candidate) => candidate.status === "complete"
  );
  next.status = allComplete ? "complete" : "active";
  const [leader] = next.standings;
  if (allComplete && next.format === "round-robin" && leader)
    next.championEntrantId = leader.entrantId;
  next.updatedAt = Date.now();
  return next;
}

export function recordLeagueResult({
  league,
  fixtureId,
  homeScore,
  awayScore,
}: {
  league: LeagueDoc;
  fixtureId: string;
  homeScore: number;
  awayScore: number;
}): LeagueDoc {
  const next: LeagueDoc = structuredClone(league);
  completeFixture(next.fixtures, {
    fixtureId,
    homeScore,
    awayScore,
    allowDraw: true,
  });
  next.standings = computeStandings(next.entrants, next.fixtures, next.points);
  next.status = next.fixtures.every(
    (candidate) => candidate.status === "complete"
  )
    ? "complete"
    : "active";
  next.updatedAt = Date.now();
  return next;
}
