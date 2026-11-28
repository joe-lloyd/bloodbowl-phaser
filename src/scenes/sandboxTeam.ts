import { TeamFactory } from "../game/TeamFactory";
import { appearanceOf } from "../game/names/playerIdentity";
import { arenaSquad } from "../game/deathbowl/squad";
import type { RosterName, Team } from "../types/Team";

function dressPlayers(team: Team, rosterName: RosterName, teamName: string) {
  for (const player of team.players) {
    const appearance = appearanceOf(
      { id: `${teamName}-${String(player.number)}`, positionName: player.positionName },
      rosterName
    );
    if (appearance) player.appearance = appearance;
  }
}

export function sandboxTeam(rosterName: RosterName, teamName: string, color: number): Team {
  const team = TeamFactory.createTestTeam(rosterName, teamName, color);
  dressPlayers(team, rosterName, teamName);
  return team;
}

export function arenaTeam(rosterName: RosterName, teamName: string, color: number): Team {
  const team = arenaSquad(rosterName, teamName, color);
  dressPlayers(team, rosterName, teamName);
  return team;
}
