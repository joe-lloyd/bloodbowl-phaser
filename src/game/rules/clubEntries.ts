import type { Player } from "../../types/Player";
import type { Team } from "../../types/Team";
import { getRosterByRosterName } from "../../data/RosterTemplates";
import { GAME_TYPES, type GameType } from "../variants/gameTypes";
import { draftRulesFor } from "./draftRules";
import { validateRosterLegality } from "./rosterLegality";
import { corePlayers, gutterSpecialist, staysHome } from "./club";

export interface ClubEntry {
  gameType: GameType;
  squad: Player[];
  home: Player[];
  staffHome: string[];
  problems: string[];
}

function staffLeftHome(team: Team, gameType: GameType): string[] {
  const draft = draftRulesFor(gameType);
  return [
    team.apothecary && !draft.apothecary ? "Apothecary" : null,
    team.coaches > 0 && !draft.assistantCoaches ? "Assistant Coaches" : null,
    team.cheerleaders > 0 && !draft.cheerleaders ? "Cheerleaders" : null,
  ].filter((staff): staff is string => staff !== null);
}

function clubPlayers(team: Team): Player[] {
  const specialist = gutterSpecialist(team);
  return [...corePlayers(team), ...(specialist ? [specialist] : [])];
}

function clubEntry(team: Team, gameType: GameType): ClubEntry {
  const home = staysHome(team, gameType);
  const players = clubPlayers(team);
  return {
    gameType,
    squad: players.filter((player) => !home.has(player.id)),
    home: players.filter((player) => home.has(player.id)),
    staffHome: staffLeftHome(team, gameType),
    problems: validateRosterLegality(
      team,
      getRosterByRosterName(team.rosterName),
      gameType
    ).map((violation) => violation.detail),
  };
}

export function clubEntries(team: Team): ClubEntry[] {
  return GAME_TYPES.map((gameType) => clubEntry(team, gameType));
}
