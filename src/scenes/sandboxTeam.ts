import { TeamFactory } from "../game/TeamFactory";
import { appearanceOf } from "../game/names/playerIdentity";
import { getRosterByRosterName } from "../data/RosterTemplates";
import { createPlayer, PositionKeyWord } from "../types/Player";
import type { RosterName, Team } from "../types/Team";

const ARENA_SQUAD = 10;

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
  const team = TeamFactory.createTestTeam(rosterName, teamName, color);
  const templates = getRosterByRosterName(rosterName).playerTemplates;
  const lineman =
    templates.find((template) => template.keywords.includes(PositionKeyWord.LINEMAN)) ??
    templates[0];
  while (lineman && team.players.length < ARENA_SQUAD) {
    team.players.push(createPlayer(lineman, team.id, team.players.length + 1));
  }
  dressPlayers(team, rosterName, teamName);
  return team;
}
