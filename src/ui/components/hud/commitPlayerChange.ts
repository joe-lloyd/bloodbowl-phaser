import type { Player } from "../../../types/Player";
import type { Team } from "../../../types/Team";
import { loadTeams, saveTeam } from "../../../game/managers/TeamManager";
import { dehydrateTeam } from "../../../data/persistence/teamPersistence";
import { restoreTeam } from "../../../headless/serialization";

export function commitPlayerChange(
  team: Team,
  playerId: string,
  change: (latestTeam: Team, latestPlayer: Player) => void
): void {
  const latestTeam = loadTeams().find((t) => t.id === team.id);
  const latestPlayer = latestTeam?.players.find((p) => p.id === playerId);
  if (!latestTeam || !latestPlayer) {
    throw new Error("This player could not be found in the saved team.");
  }
  change(latestTeam, latestPlayer);
  void saveTeam(latestTeam);
  const stored = loadTeams().find((t) => t.id === team.id);
  if (
    !stored ||
    JSON.stringify(dehydrateTeam(stored)) !==
      JSON.stringify(dehydrateTeam(latestTeam))
  ) {
    throw new Error("The team could not be saved, so nothing was changed.");
  }
  restoreTeam(team, latestTeam);
}
