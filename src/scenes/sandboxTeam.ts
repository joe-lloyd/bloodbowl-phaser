import { TeamFactory } from "../game/TeamFactory";
import { appearanceOf } from "../game/names/playerIdentity";
import type { RosterName, Team } from "../types/Team";

export function sandboxTeam(rosterName: RosterName, teamName: string, color: number): Team {
  const team = TeamFactory.createTestTeam(rosterName, teamName, color);
  for (const player of team.players) {
    const appearance = appearanceOf(
      { id: `${teamName}-${String(player.number)}`, positionName: player.positionName },
      rosterName
    );
    if (appearance) player.appearance = appearance;
  }
  return team;
}
