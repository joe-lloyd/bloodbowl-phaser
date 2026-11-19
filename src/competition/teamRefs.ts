import { getTeamById, loadTeams } from "../game/managers/TeamManager";
import { fetchCoachTeam } from "../firebase/cloudTeamRepository";
import { type Team } from "../types/Team";
import { type CompetitionDoc, type CompetitionEntrant } from "./types";

export async function fetchEntrantTeam(
  entrant: CompetitionEntrant
): Promise<Team | null> {
  const local = getTeamById(entrant.teamId);
  if (local) return local;
  return entrant.ownerUid
    ? fetchCoachTeam({ ownerUid: entrant.ownerUid, teamId: entrant.teamId })
    : null;
}

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
