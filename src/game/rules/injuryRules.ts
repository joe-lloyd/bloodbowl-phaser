import { type Team } from "../../types/Team";
import { type InjuryTableId } from "../variants/gameTypeRules";
import { activeRules } from "../variants/activeMatch";

type InjuryRules = "this-game" | "carried" | "lasting";

type TeamMode = Pick<Team, "advancementMode">;

function injuryRules(team: TeamMode, competition: boolean): InjuryRules {
  return competition ? competitionRules(team.advancementMode) : "this-game";
}

function competitionRules(mode: TeamMode["advancementMode"]): InjuryRules {
  switch (mode) {
    case undefined:
    case "matched-play":
      return "this-game";
    case "sevens-skill-selection":
      return "carried";
    case "advanced-league":
      return "lasting";
  }
}

export function carriesInjuries(team: TeamMode, competition: boolean): boolean {
  return injuryRules(team, competition) !== "this-game";
}

export function injuryTableFor(
  state: { competition?: boolean },
  team: TeamMode | undefined
): InjuryTableId {
  const tables = activeRules().injuryTables;
  return team && injuryRules(team, !!state.competition) === "lasting"
    ? tables.lasting
    : tables.short;
}

interface MatchTeams {
  getState(): { competition?: boolean };
  getTeam(teamId: string): TeamMode | undefined;
}

export function playerInjuryTable(
  game: MatchTeams,
  player: { teamId: string }
): InjuryTableId {
  return injuryTableFor(game.getState(), game.getTeam(player.teamId));
}
