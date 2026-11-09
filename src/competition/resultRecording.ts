import { getCurrentUser } from "../firebase/auth";
import { getTeamById, saveTeam } from "../game/managers/TeamManager";
import { stampFirstCompletedMatch } from "../game/rules/teamLifecycle";
import {
  recordLeagueResult,
  recordTournamentResult,
  walkOverNext,
} from "./logic";
import { updateCompetition } from "./repository";
import {
  CompetitionContext,
  CompetitionDoc,
  CompetitionEntrant,
  CompetitionFixture,
  FixtureResult,
  PenaltyShootout,
} from "./types";
import { Team } from "../types/Team";

function updateTeamRecord(
  entrant: CompetitionEntrant,
  fixtureKey: string,
  ownScore: number,
  winnerEntrantId: string | undefined,
  progressedTeam?: Team,
  /** False for a walkover: the game counts in no record. */
  counts = true
): void {
  const persisted = getTeamById(entrant.teamId);
  if (!persisted || persisted.recordedFixtureIds?.includes(fixtureKey)) return;
  const team = structuredClone(persisted);
  team.recordedFixtureIds = [...(team.recordedFixtureIds ?? []), fixtureKey];
  if (progressedTeam) {
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
        injuries: structuredClone(updated.injuries),
        cost: updated.cost,
        teamValue: updated.teamValue,
      };
    });
    // Rolled in the post-game sequence at full time (leagueRoster.ts).
    team.dedicatedFans = progressedTeam.dedicatedFans;
  }
  if (counts) {
    team.touchdowns = (team.touchdowns ?? 0) + ownScore;
    // The fixture's winner, so a Penalty Shoot-out counts as a win and a loss
    if (!winnerEntrantId) team.draws = (team.draws ?? 0) + 1;
    else if (winnerEntrantId === entrant.id) team.wins = (team.wins ?? 0) + 1;
    else team.losses = (team.losses ?? 0) + 1;
  }
  // A recorded fixture result is a confirmed completed match — the team is
  // active from here on (see teamLifecycle.ts). A no-op once already set.
  stampFirstCompletedMatch(team);
  saveTeam(team);
}

/**
 * The results screen saves the match's own copy of a team, loaded at
 * kick-off. Full time has already recorded the fixture on the stored team,
 * and may have closed its competition, so take that record from storage.
 */
export function keepRecordedResult(team: Team): void {
  const stored = getTeamById(team.id);
  if (!stored) return;
  team.wins = stored.wins;
  team.draws = stored.draws;
  team.losses = stored.losses;
  team.touchdowns = stored.touchdowns;
  team.recordedFixtureIds = stored.recordedFixtureIds;
  team.activeCompetitionId = stored.activeCompetitionId;
}

/**
 * Count a fixture in whichever of its teams this coach's library holds. Both
 * coaches come through here at full time, whoever recorded the result first,
 * and each has only their own team.
 */
function updateReachableTeams(
  competition: CompetitionDoc,
  fixture: CompetitionFixture,
  result: FixtureResult,
  progressedTeams?: { home: Team; away: Team }
): void {
  const entrantFor = (id: string | null) =>
    competition.entrants.find((entrant) => entrant.id === id);
  const home = entrantFor(fixture.homeEntrantId);
  const away = entrantFor(fixture.awayEntrantId);
  // Fixture ids repeat from one competition to the next
  const key = `${competition.id}:${fixture.id}`;
  if (home && away) {
    const { homeScore, awayScore, winnerEntrantId } = result;
    // A game played against a team that withdrew meanwhile still carries
    // its players' SPP and injuries, but it was walked over
    const counts = !result.walkover;
    updateTeamRecord(
      home,
      key,
      homeScore,
      winnerEntrantId,
      progressedTeams?.home,
      counts
    );
    updateTeamRecord(
      away,
      key,
      awayScore,
      winnerEntrantId,
      progressedTeams?.away,
      counts
    );
  }
  // A completed competition frees every entrant it holds: only the coaches
  // whose teams are reachable from this session (their own library) can
  // actually have the field cleared here — see clearActiveCompetition.
  if (competition.status === "complete") {
    competition.entrants.forEach((entrant) =>
      clearActiveCompetition(entrant.teamId, competition.id)
    );
  }
}

/**
 * Idempotent orchestration seam used by manual reports and completed games.
 * Competition math works even when team progression is absent; when either
 * entrant exists in this coach's private/local library, its season record is
 * persisted as the lightweight progression tie-in.
 */
export async function recordCompetitionFixture(
  context: CompetitionContext,
  homeScore: number,
  awayScore: number,
  progressedTeams?: { home: Team; away: Team },
  /** How a knockout game left level was decided. */
  penalties?: PenaltyShootout
): Promise<CompetitionDoc> {
  const uid = getCurrentUser()?.uid;
  // A result already recorded stands: both coaches report at full time
  const updated = await updateCompetition(
    context.competitionType,
    context.competitionId,
    (latest) => {
      const fixture = latest.fixtures.find(
        (candidate) => candidate.id === context.fixtureId
      );
      if (!fixture) throw new Error("Fixture not found.");
      if (fixture.status === "complete" && !fixture.result?.bye) return null;
      const next =
        latest.type === "league"
          ? recordLeagueResult(latest, context.fixtureId, homeScore, awayScore)
          : recordTournamentResult(
              latest,
              context.fixtureId,
              homeScore,
              awayScore,
              penalties
            );
      const reporterEntrantIndex = next.entrants.findIndex(
        (entrant) =>
          entrant.ownerUid === uid &&
          (entrant.id === fixture.homeEntrantId ||
            entrant.id === fixture.awayEntrantId)
      );
      if (reporterEntrantIndex >= 0)
        next.reporterEntrantIndex = reporterEntrantIndex;
      return next;
    }
  );

  const recorded = updated.fixtures.find(
    (fixture) => fixture.id === context.fixtureId
  );
  if (!recorded?.result) throw new Error("Fixture has no recorded result.");
  updateReachableTeams(updated, recorded, recorded.result, progressedTeams);
  // A knockout winner may have gone through to a withdrawn team
  return closeWalkovers(updated);
}

/**
 * Close every open game a withdrawn entrant would play as a walkover. Each
 * is its own write: the database rules check a walkover, and the knockout
 * winner it sends through, near the most they can evaluate in one request.
 * A walkover is owed, not reported, so a refused write leaves the games
 * open for the next writer rather than failing what the coach did.
 */
export async function closeWalkovers(
  competition: CompetitionDoc
): Promise<CompetitionDoc> {
  let current = competition;
  try {
    for (let closed = true; closed; ) {
      current = await updateCompetition(
        competition.type,
        competition.id,
        (latest) => {
          const next = walkOverNext(latest);
          closed = next !== null;
          return next;
        }
      );
    }
  } catch (reason) {
    console.warn("[competition] could not close walkovers", reason);
  }
  // A walkover may be what finished it, after the result that came first
  // found it still active. Opening the page frees another coach's teams.
  if (current.status === "complete")
    current.entrants.forEach((entrant) =>
      clearActiveCompetition(entrant.teamId, current.id)
    );
  return current;
}

/**
 * A coach withdraws their own entrant: the entrant is marked withdrawn and
 * the team's active-competition association is cleared. Games already
 * played stand; the ones left close as walkovers.
 */
export async function withdrawFromCompetition(
  context: Pick<CompetitionContext, "competitionType" | "competitionId">,
  entrantId: string
): Promise<CompetitionDoc> {
  const updated = await updateCompetition(
    context.competitionType,
    context.competitionId,
    (latest) => {
      if (!latest.entrants.some((candidate) => candidate.id === entrantId))
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
  )!;
  clearActiveCompetition(entrant.teamId, updated.id);
  return closeWalkovers(updated);
}

/**
 * Clear `Team.activeCompetitionId` when it points at the given competition —
 * used both when a competition completes and when a team withdraws. A no-op
 * when the team is not reachable from this session (e.g. another coach's
 * private library) or already points elsewhere.
 */
export function clearActiveCompetition(
  teamId: string,
  competitionId: string
): void {
  const team = getTeamById(teamId);
  if (!team || team.activeCompetitionId !== competitionId) return;
  delete team.activeCompetitionId;
  saveTeam(team);
}
