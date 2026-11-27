import { getCurrentUser } from "../firebase/auth";
import { getTeamById, saveTeam } from "../game/managers/TeamManager";
import { ownLocalTeam } from "./teamRefs";
import { stampFirstCompletedMatch } from "../game/rules/teamLifecycle";
import { MIN_DEDICATED_FANS } from "../game/rules/sevensPrices";
import { queueExpensiveMistakes } from "../game/rules/expensiveMistakes";
import {
  fanFactor,
  competitionPaysWinnings,
  earnsWinnings,
  fixtureWinnings,
  payWinnings,
  rollD3,
} from "../game/rules/winnings";
import { type IRNGService, RNGService } from "../services/rng/RNGService";
import {
  recordLeagueResult,
  recordTournamentResult,
  walkOverNext,
} from "./logic";
import { updateCompetition } from "./repository";
import {
  type CompetitionContext,
  type CompetitionDoc,
  type CompetitionEntrant,
  type CompetitionFixture,
  type FixtureResult,
  type PenaltyShootout,
} from "./types";
import { type Team } from "../types/Team";
import { manageComputerTeams, settleDraftOffers } from "./computerTeams";
import { rollDraftOffers } from "../game/progression/advancementModes";
import { carriesInjuries } from "../game/rules/injuryRules";
import { restoreClubHome } from "../game/rules/club";
import { assertFixtureInOpenRound } from "./schedule";
import { revealNextRound } from "./roundPlan";

interface TeamRecordUpdate {
  entrant: CompetitionEntrant;
  fixtureKey: string;
  ownScore: number;
  winnerEntrantId: string | undefined;
  progressedTeam?: Team;
  counts?: boolean;
  winnings?: number;
}

function applyProgression(team: Team, progressedTeam: Team): void {
  const carries = carriesInjuries(team, true);
  const progression = new Map(
    progressedTeam.players.map((player) => [player.id, player])
  );
  team.players = team.players.map((player) => {
    const updated = progression.get(player.id);
    if (!updated) return player;
    return {
      ...player,
      spp: updated.spp,
      level: updated.level,
      skills: structuredClone(updated.skills),
      stats: structuredClone(updated.stats),
      baseStats: structuredClone(updated.baseStats),
      injuries: carries ? structuredClone(updated.injuries) : player.injuries,
      cost: updated.cost,
      teamValue: updated.teamValue,
    };
  });
  team.dedicatedFans = progressedTeam.dedicatedFans;
}

function outcomeCounter(
  entrantId: string,
  winnerEntrantId: string | undefined
): "wins" | "losses" | "draws" {
  if (!winnerEntrantId) return "draws";
  return winnerEntrantId === entrantId ? "wins" : "losses";
}

function payFixtureWinnings({
  team,
  fixtureKey,
  counts,
  winnings,
}: {
  team: Team;
  fixtureKey: string;
  counts: boolean;
  winnings: number | undefined;
}): void {
  payWinnings(team, winnings ?? 0);
  if (counts && winnings !== undefined && earnsWinnings(team))
    queueExpensiveMistakes(team, fixtureKey);
}

function updateTeamRecord({
  entrant,
  fixtureKey,
  ownScore,
  winnerEntrantId,
  progressedTeam,
  counts = true,
  winnings,
}: TeamRecordUpdate): void | Promise<void> {
  const persisted = ownLocalTeam(entrant);
  if (!persisted) return;
  if (persisted.recordedFixtureIds?.includes(fixtureKey))
    return saveTeam(persisted);
  const team = structuredClone(persisted);
  team.recordedFixtureIds = [...(team.recordedFixtureIds ?? []), fixtureKey];
  if (progressedTeam) applyProgression(team, progressedTeam);
  if (counts) {
    team.touchdowns += ownScore;
    team[outcomeCounter(entrant.id, winnerEntrantId)]++;
  }
  payFixtureWinnings({ team, fixtureKey, counts, winnings });
  stampFirstCompletedMatch(team);
  return saveTeam(team);
}

export function keepRecordedResult(team: Team): void {
  const stored = getTeamById(team.id);
  if (!stored) return;
  restoreClubHome(team, stored);
  team.wins = stored.wins;
  team.draws = stored.draws;
  team.losses = stored.losses;
  team.touchdowns = stored.touchdowns;
  if (stored.recordedFixtureIds === undefined) delete team.recordedFixtureIds;
  else team.recordedFixtureIds = stored.recordedFixtureIds;

  team.treasury = stored.treasury;

  const queued = (stored.pendingDevelopment ?? []).filter(
    (entry) =>
      entry.kind === "expensive-mistakes" &&
      !team.pendingDevelopment?.some((own) => own.id === entry.id)
  );
  if (queued.length > 0)
    team.pendingDevelopment = [...(team.pendingDevelopment ?? []), ...queued];
  if (stored.activeCompetitionId === undefined) delete team.activeCompetitionId;
  else team.activeCompetitionId = stored.activeCompetitionId;
}

async function updateEntrantRecords({
  home,
  away,
  fixtureKey,
  result,
  progressedTeams,
}: {
  home: CompetitionEntrant | undefined;
  away: CompetitionEntrant | undefined;
  fixtureKey: string;
  result: FixtureResult;
  progressedTeams: { home: Team; away: Team } | undefined;
}): Promise<void> {
  if (!home || !away) return;
  const sides = [
    {
      entrant: home,
      ownScore: result.homeScore,
      progressedTeam: progressedTeams?.home,
      winnings: result.winnings?.home,
    },
    {
      entrant: away,
      ownScore: result.awayScore,
      progressedTeam: progressedTeams?.away,
      winnings: result.winnings?.away,
    },
  ];
  for (const { entrant, ownScore, progressedTeam, winnings } of sides) {
    await updateTeamRecord({
      entrant,
      ownScore,
      fixtureKey,
      winnerEntrantId: result.winnerEntrantId,
      counts: !result.walkover,
      ...(progressedTeam && { progressedTeam }),
      ...(winnings !== undefined && { winnings }),
    });
  }
}

async function updateReachableTeams({
  competition,
  fixture,
  result,
  progressedTeams,
}: {
  competition: CompetitionDoc;
  fixture: CompetitionFixture;
  result: FixtureResult;
  progressedTeams?: { home: Team; away: Team };
}): Promise<void> {
  const entrantFor = (id: string | null) =>
    competition.entrants.find((entrant) => entrant.id === id);
  const home = entrantFor(fixture.homeEntrantId);
  const away = entrantFor(fixture.awayEntrantId);

  const key = `${competition.id}:${fixture.id}`;
  await updateEntrantRecords({
    home,
    away,
    fixtureKey: key,
    result,
    progressedTeams,
  });

  await releaseEntrants(competition);
}

interface RecordFixtureOptions {
  fanFactors?: { home: number; away: number };

  stalled?: { home: boolean; away: boolean };

  rng?: Pick<IRNGService, "rollDie">;
}

function rollFanFactors(
  competition: CompetitionDoc,
  fixture: CompetitionFixture,
  rng: Pick<IRNGService, "rollDie">
): { home: number; away: number } {
  const fansOf = (entrantId: string | null) => {
    const entrant = competition.entrants.find(
      (candidate) => candidate.id === entrantId
    );
    const team = entrant && ownLocalTeam(entrant);
    return team?.dedicatedFans ?? MIN_DEDICATED_FANS;
  };
  return {
    home: fanFactor(fansOf(fixture.homeEntrantId), rollD3(rng)),
    away: fanFactor(fansOf(fixture.awayEntrantId), rollD3(rng)),
  };
}

interface FixtureRecord {
  context: CompetitionContext;
  homeScore: number;
  awayScore: number;
  progressedTeams?: { home: Team; away: Team };
  penalties?: PenaltyShootout;
  options?: RecordFixtureOptions;
}

function applyFixtureWinnings(
  next: CompetitionDoc,
  previous: { competition: CompetitionDoc; fixture: CompetitionFixture },
  request: FixtureRecord
): void {
  if (!competitionPaysWinnings(previous.competition)) return;
  const options = request.options ?? {};
  const fanFactors =
    options.fanFactors ??
    (request.progressedTeams
      ? undefined
      : rollFanFactors(
          previous.competition,
          previous.fixture,
          options.rng ?? new RNGService(Date.now())
        ));
  const result = next.fixtures.find(
    (candidate) => candidate.id === request.context.fixtureId
  )?.result;
  if (result && fanFactors)
    result.winnings = fixtureWinnings(
      fanFactors,
      request.homeScore,
      request.awayScore,
      options.stalled ?? { home: false, away: false }
    );
}

function markReporter(
  next: CompetitionDoc,
  fixture: CompetitionFixture,
  uid: string | undefined
): void {
  const index = next.entrants.findIndex(
    (entrant) =>
      entrant.ownerUid === uid &&
      (entrant.id === fixture.homeEntrantId ||
        entrant.id === fixture.awayEntrantId)
  );
  if (index !== -1) next.reporterEntrantIndex = index;
}

function swapped<Value>(sides: { home: Value; away: Value }) {
  return { home: sides.away, away: sides.home };
}

function swappedOptions(options: RecordFixtureOptions): RecordFixtureOptions {
  return {
    ...options,
    ...(options.fanFactors && { fanFactors: swapped(options.fanFactors) }),
    ...(options.stalled && { stalled: swapped(options.stalled) }),
  };
}

export function orientToFixture(
  request: FixtureRecord,
  homeTeamId: string | undefined
): FixtureRecord {
  const teams = request.progressedTeams;
  if (!teams || teams.home.id === homeTeamId || teams.away.id !== homeTeamId)
    return request;
  return {
    ...request,
    homeScore: request.awayScore,
    awayScore: request.homeScore,
    progressedTeams: swapped(teams),
    ...(request.penalties && { penalties: swapped(request.penalties) }),
    ...(request.options && { options: swappedOptions(request.options) }),
  };
}

function homeTeamIdOf(
  competition: CompetitionDoc,
  fixture: CompetitionFixture
): string | undefined {
  return competition.entrants.find(
    (entrant) => entrant.id === fixture.homeEntrantId
  )?.teamId;
}

function recordFixtureTransaction(
  latest: CompetitionDoc,
  request: FixtureRecord,
  uid: string | undefined
): CompetitionDoc | null {
  const { context, homeScore, awayScore, penalties } = request;
  const fixture = latest.fixtures.find(
    (candidate) => candidate.id === context.fixtureId
  );
  if (!fixture) throw new Error("Fixture not found.");
  if (fixture.status === "complete" && !fixture.result?.bye) return null;
  assertFixtureInOpenRound(latest, fixture);
  const next =
    latest.type === "league"
      ? recordLeagueResult({
          league: latest,
          fixtureId: context.fixtureId,
          homeScore,
          awayScore,
        })
      : recordTournamentResult({
          tournament: latest,
          fixtureId: context.fixtureId,
          homeScore,
          awayScore,
          ...(penalties !== undefined && { penalties }),
        });
  applyFixtureWinnings(next, { competition: latest, fixture }, request);
  markPlayedVia(next, context);
  markReporter(next, fixture, uid);
  return next;
}

function markPlayedVia(next: CompetitionDoc, context: CompetitionContext): void {
  const result = next.fixtures.find(
    (candidate) => candidate.id === context.fixtureId
  )?.result;
  if (result && context.playedVia) result.playedVia = context.playedVia;
}

const roundDraw =
  (rng?: Pick<IRNGService, "rollDie">) =>
  (sides: number): number =>
    (rng ?? new RNGService(Date.now())).rollDie(sides);

export async function recordCompetitionFixture(
  reported: FixtureRecord
): Promise<CompetitionDoc> {
  const { context } = reported;
  const uid = getCurrentUser()?.uid;
  let request = reported;
  const updated = await updateCompetition(
    context.competitionType,
    context.competitionId,
    (latest) => {
      const fixture = latest.fixtures.find(
        (candidate) => candidate.id === context.fixtureId
      );
      request = orientToFixture(
        reported,
        fixture && homeTeamIdOf(latest, fixture)
      );
      const next = recordFixtureTransaction(latest, request, uid);
      return next && revealNextRound(next, roundDraw(reported.options?.rng));
    }
  );
  const { progressedTeams } = request;
  const options = request.options ?? {};
  const recorded = updated.fixtures.find(
    (fixture) => fixture.id === context.fixtureId
  );
  if (!recorded?.result) throw new Error("Fixture has no recorded result.");
  await updateReachableTeams({
    competition: updated,
    fixture: recorded,
    result: recorded.result,
    ...(progressedTeams && { progressedTeams }),
  });
  if (!progressedTeams) {
    try {
      manageComputerTeams(updated, options.rng ?? new RNGService(Date.now()), [
        recorded.homeEntrantId,
        recorded.awayEntrantId,
      ]);
    } catch (reason) {
      console.warn("[competition] could not manage computer teams", reason);
    }
  }
  return closeWalkovers(updated);
}

export async function closeWalkovers(
  competition: CompetitionDoc
): Promise<CompetitionDoc> {
  let current = competition;
  try {
    const progress = { closed: true };
    while (progress.closed) {
      current = await updateCompetition(
        competition.type,
        competition.id,
        (latest) => {
          const next = walkOverNext(latest);
          progress.closed = next !== null;
          return next && revealNextRound(next, roundDraw());
        }
      );
    }
  } catch (reason) {
    console.warn("[competition] could not close walkovers", reason);
  }

  await releaseEntrants(current);
  return current;
}

export async function withdrawFromCompetition(
  context: Pick<CompetitionContext, "competitionType" | "competitionId">,
  entrantId: string
): Promise<CompetitionDoc> {
  const updated = await updateCompetition(
    context.competitionType,
    context.competitionId,
    (latest) => {
      if (latest.entrants.every((candidate) => candidate.id !== entrantId))
        throw new Error("Entrant not found.");
      return {
        ...latest,
        entrants: latest.entrants.map((candidate) =>
          candidate.id === entrantId
            ? { ...candidate, withdrawn: true }
            : candidate
        ),
        updatedAt: Date.now(),
      };
    }
  );
  const entrant = updated.entrants.find(
    (candidate) => candidate.id === entrantId
  );
  if (!entrant) throw new Error("Entrant not found.");
  await clearActiveCompetition(entrant.teamId, updated.id);
  return closeWalkovers(updated);
}

function scoutAtTournamentEnd(
  teamId: string,
  competition: CompetitionDoc
): void | Promise<void> {
  if (competition.type !== "tournament" || competition.playOffs) return;
  const team = getTeamById(teamId);
  if (!team?.club || team.activeCompetitionId !== competition.id) return;
  rollDraftOffers(team, new RNGService(Date.now()), `tournament-${competition.id}`);
  if (team.computerCoached) settleDraftOffers(team);
  return saveTeam(team);
}

async function releaseEntrants(competition: CompetitionDoc): Promise<void> {
  if (competition.status !== "complete") return;
  for (const entrant of competition.entrants) {
    await scoutAtTournamentEnd(entrant.teamId, competition);
    await clearActiveCompetition(entrant.teamId, competition.id);
  }
}

export function clearActiveCompetition(
  teamId: string,
  competitionId: string
): void | Promise<void> {
  const team = getTeamById(teamId);
  if (team?.activeCompetitionId !== competitionId) return;
  delete team.activeCompetitionId;
  return saveTeam(team);
}
