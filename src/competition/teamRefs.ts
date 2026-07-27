/**
 * Resolve a competition entrant's team reference to a live roster, and
 * refresh the entrant's cached display fields — the two operations design.md
 * calls for instead of the removed `CompetitionEntrant.team` snapshot.
 */

import { getTeamById, loadTeams } from "../game/managers/TeamManager";
import { getSharedTeam } from "../firebase/sharedTeamRepository";
import { Team } from "../types/Team";
import { CompetitionDoc, CompetitionEntrant } from "./types";

/**
 * Fetch the live roster a fixture should be played with. A "local" entrant
 * is resolved through this coach's own team library (works whenever this
 * session is signed in as — or has locally saved — that team); a "shared"
 * entrant is resolved through the public shared-team snapshot, since a
 * coach cannot read another coach's private team library.
 */
export async function fetchEntrantTeam(
  entrant: CompetitionEntrant
): Promise<Team | null> {
  if (entrant.source === "shared") {
    if (!entrant.ownerUid) return null;
    const shared = await getSharedTeam(entrant.ownerUid, entrant.teamId);
    return shared?.team ?? null;
  }
  return getTeamById(entrant.teamId) ?? null;
}

/**
 * Refresh cached display fields (team name, roster name, coach name) for
 * every entrant this reader can currently see — their own local/cloud
 * library teams. Shared entrants refresh from the currently-loaded shared
 * team list, when provided. Returns a new competition doc only when
 * something actually changed, so callers can skip an unnecessary save.
 */
export function refreshEntrantDisplays<T extends CompetitionDoc>(
  competition: T,
  ownedTeams: Team[] = loadTeams(),
  sharedTeamsByKey: Map<string, { name: string; ownerName: string }> = new Map()
): T {
  const ownedById = new Map(ownedTeams.map((team) => [team.id, team]));
  let changed = false;
  const entrants = competition.entrants.map((entrant) => {
    if (entrant.source === "local") {
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
    }
    const shared = entrant.sharedTeamId
      ? sharedTeamsByKey.get(entrant.sharedTeamId)
      : undefined;
    if (!shared) return entrant;
    const next = {
      ...entrant,
      name: shared.name,
      coachName: shared.ownerName,
    };
    if (next.name !== entrant.name || next.coachName !== entrant.coachName) {
      changed = true;
    }
    return next;
  });
  return changed ? { ...competition, entrants } : competition;
}
