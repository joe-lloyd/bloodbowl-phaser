import { TeamFactory } from "../TeamFactory";
import { getRosterByRosterName } from "../../data/RosterTemplates";
import { createPlayer, PositionKeyWord } from "../../types/Player";
import type { RosterName, Team } from "../../types/Team";

const ARENA_SQUAD = 10;

export function arenaSquad(rosterName: RosterName, teamName: string, color: number): Team {
  const team = TeamFactory.createTestTeam(rosterName, teamName, color);
  const templates = getRosterByRosterName(rosterName).playerTemplates;
  const lineman =
    templates.find((template) => template.keywords.includes(PositionKeyWord.LINEMAN)) ??
    templates[0];
  while (lineman && team.players.length < ARENA_SQUAD) {
    team.players.push(createPlayer(lineman, team.id, team.players.length + 1));
  }
  return team;
}
