import { getTeamById, loadTeams } from "../game/managers/TeamManager";
import { getCurrentUser } from "../firebase/auth";
import { fetchCoachTeam } from "../firebase/cloudTeamRepository";
import { type Team } from "../types/Team";
import { type CompetitionDoc, type CompetitionEntrant } from "./types";

function viewerOwns(entrant: CompetitionEntrant): boolean {
  const viewer = getCurrentUser()?.uid;
  return !viewer || entrant.ownerUid === null || entrant.ownerUid === viewer;
}

export function ownLocalTeam(entrant: CompetitionEntrant): Team | undefined {
  return viewerOwns(entrant) ? getTeamById(entrant.teamId) : undefined;
}

export async function fetchEntrantTeam(
  entrant: CompetitionEntrant
): Promise<Team | null> {
  const local = ownLocalTeam(entrant);
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
    const team = viewerOwns(entrant) ? ownedById.get(entrant.teamId) : undefined;
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
