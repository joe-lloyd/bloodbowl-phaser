import { loadTeams } from "../game/managers/TeamManager";
import type { Team } from "../types/Team";
import { findCompetitionById } from "./repository";
import { clearActiveCompetition, releaseFinishedEntrant } from "./resultRecording";
import type { CompetitionDoc } from "./types";

export function lockIsStale(
  team: Pick<Team, "id">,
  competition: CompetitionDoc | null
): boolean {
  if (!competition) return false;
  if (competition.status === "complete") return true;
  return competition.entrants.every(
    (entrant) => !(entrant.teamId === team.id && !entrant.withdrawn)
  );
}

export async function releaseFinishedEntries(): Promise<void> {
  const locked = loadTeams().filter(
    (team) => team.activeCompetitionId && !team.computerCoached
  );
  for (const team of locked) {
    const competitionId = team.activeCompetitionId;
    if (!competitionId) continue;
    const competition = await findCompetitionById(competitionId);
    if (competition?.status === "complete")
      await releaseFinishedEntrant(team.id, competition);
    else if (lockIsStale(team, competition))
      await clearActiveCompetition(team.id, competitionId);
  }
}
