/**
 * Resolve a competition entrant's team reference to a live roster, and
 * refresh the entrant's cached display fields — the two operations design.md
 * calls for instead of the removed `CompetitionEntrant.team` snapshot.
 */

import { getTeamById, loadTeams } from "../game/managers/TeamManager";
import { fetchAllCoachTeams } from "../firebase/cloudTeamRepository";
import { Team } from "../types/Team";
import { CompetitionDoc, CompetitionEntrant } from "./types";

/**
 * Fetch the live roster a fixture should be played with. Every entrant is
 * resolved the same way, by team id — this coach's own library first (works
 * offline, and whenever this session has that team locally), falling back to
 * a live read of every coach's team library (shared-team-library: "no
 * distinction between a 'shared' and a 'local' entrant source") for a team
 * this session doesn't own.
 */
export async function fetchEntrantTeam(
  entrant: CompetitionEntrant
): Promise<Team | null> {
  const local = getTeamById(entrant.teamId);
  if (local) return local;
  const owned = await fetchAllCoachTeams();
  return owned.find((candidate) => candidate.team.id === entrant.teamId)?.team ?? null;
}

/**
 * Refresh cached display fields (team name, roster name, coach name) for
 * every entrant this reader can currently see — their own local/cloud
 * library teams. Returns a new competition doc only when something actually
 * changed, so callers can skip an unnecessary save.
 */
export function refreshEntrantDisplays<T extends CompetitionDoc>(
  competition: T,
  ownedTeams: Team[] = loadTeams()
): T {
  const ownedById = new Map(ownedTeams.map((team) => [team.id, team]));
  let changed = false;
  const entrants = competition.entrants.map((entrant) => {
    const team = ownedById.get(entrant.teamId);
    if (!team) return entrant;
    const next = {
      ...entrant,
      name: team.name,
      rosterName: team.rosterName,
      coachName: team.coachName || entrant.coachName,
    };
    if (
      next.name !== entrant.name ||
      next.rosterName !== entrant.rosterName ||
      next.coachName !== entrant.coachName
    ) {
      changed = true;
    }
    return next;
  });
  return changed ? { ...competition, entrants } : competition;
}
