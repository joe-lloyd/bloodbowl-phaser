import { getTeamById, saveTeam } from "../game/managers/TeamManager";
import { stampFirstCompletedMatch } from "../game/rules/teamLifecycle";
import { recordLeagueResult, recordTournamentResult } from "./logic";
import { getCompetition, saveCompetition } from "./repository";
import {
  CompetitionContext,
  CompetitionDoc,
  CompetitionEntrant,
  CompetitionFixture,
} from "./types";
import { Team } from "../types/Team";

function updateTeamRecord(
  entrant: CompetitionEntrant,
  fixtureKey: string,
  ownScore: number,
  opponentScore: number,
  progressedTeam?: Team
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
  team.touchdowns = (team.touchdowns ?? 0) + ownScore;
  if (ownScore > opponentScore) team.wins = (team.wins ?? 0) + 1;
  else if (ownScore < opponentScore) team.losses = (team.losses ?? 0) + 1;
  else team.draws = (team.draws ?? 0) + 1;
  // A recorded fixture result is a confirmed completed match — the team is
  // active from here on (see teamLifecycle.ts). A no-op once already set.
  stampFirstCompletedMatch(team);
  saveTeam(team);
}

/**
 * Count a fixture in whichever of its teams this coach's library holds. Both
 * coaches come through here at full time, whoever recorded the result first,
 * and each has only their own team.
 */
function updateReachableTeams(
  competition: CompetitionDoc,
  fixture: CompetitionFixture,
  homeScore: number,
  awayScore: number,
  progressedTeams?: { home: Team; away: Team }
): void {
  const entrantFor = (id: string | null) =>
    competition.entrants.find((entrant) => entrant.id === id);
  const home = entrantFor(fixture.homeEntrantId);
  const away = entrantFor(fixture.awayEntrantId);
  // Fixture ids repeat from one competition to the next
  const key = `${competition.id}:${fixture.id}`;
  if (home && away) {
    updateTeamRecord(home, key, homeScore, awayScore, progressedTeams?.home);
    updateTeamRecord(away, key, awayScore, homeScore, progressedTeams?.away);
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
  progressedTeams?: { home: Team; away: Team }
): Promise<CompetitionDoc> {
  const competition = await getCompetition(
    context.competitionType,
    context.competitionId
  );
  if (!competition) throw new Error("Competition not found.");
  const existing = competition.fixtures.find(
    (fixture) => fixture.id === context.fixtureId
  );
  if (!existing) throw new Error("Fixture not found.");
  if (existing.status === "complete" && !existing.result?.bye) {
    if (!existing.result) throw new Error("Fixture has no recorded result.");
    updateReachableTeams(
      competition,
      existing,
      existing.result.homeScore,
      existing.result.awayScore,
      progressedTeams
    );
    return competition;
  }

  const updated =
    competition.type === "league"
      ? recordLeagueResult(competition, context.fixtureId, homeScore, awayScore)
      : recordTournamentResult(
          competition,
          context.fixtureId,
          homeScore,
          awayScore
        );
  try {
    await saveCompetition(updated);
  } catch (reason) {
    // Both coaches report at full time. If the other got there first, the
    // rules refuse this write, and the result stands as they recorded it.
    const latest = await getCompetition(
      context.competitionType,
      context.competitionId
    );
    const fixture = latest?.fixtures.find(
      (candidate) => candidate.id === context.fixtureId
    );
    if (!latest || fixture?.status !== "complete" || !fixture.result) {
      throw reason;
    }
    updateReachableTeams(
      latest,
      fixture,
      fixture.result.homeScore,
      fixture.result.awayScore,
      progressedTeams
    );
    return latest;
  }

  updateReachableTeams(updated, existing, homeScore, awayScore, progressedTeams);
  return updated;
}

/**
 * A coach withdraws their own entrant: the entrant is marked withdrawn
 * (fixtures and standings are untouched — see design.md decision 3, which
 * gives up the immutable-snapshot property deliberately) and the team's
 * active-competition association is cleared.
 */
export async function withdrawFromCompetition(
  context: Pick<CompetitionContext, "competitionType" | "competitionId">,
  entrantId: string
): Promise<CompetitionDoc> {
  const competition = await getCompetition(
    context.competitionType,
    context.competitionId
  );
  if (!competition) throw new Error("Competition not found.");
  const entrant = competition.entrants.find(
    (candidate) => candidate.id === entrantId
  );
  if (!entrant) throw new Error("Entrant not found.");

  const updated: CompetitionDoc = {
    ...competition,
    entrants: competition.entrants.map((candidate) =>
      candidate.id === entrantId ? { ...candidate, withdrawn: true } : candidate
    ),
    updatedAt: Date.now(),
  };
  await saveCompetition(updated);
  clearActiveCompetition(entrant.teamId, competition.id);
  return updated;
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
