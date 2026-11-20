import {
  createComputerTeamFromTemplate,
  getComputerTeamTemplates,
} from "../competition/computerTeamTemplates";
import { teamPlaysGameType } from "../game/rules/rosterLegality";
import type { GameType } from "../game/variants/gameTypes";
import type { Team } from "../types/Team";
import { type TeamValueRange, withinTeamValue } from "./teamValueRange";

export function houseBotTeam({
  gameType,
  teamValue,
  random,
}: {
  gameType: GameType;
  teamValue: TeamValueRange | undefined;
  random: () => number;
}): Team | null {
  const fitting = getComputerTeamTemplates({ gameType })
    .map((template) =>
      createComputerTeamFromTemplate(template.id, {
        gameType,
        advancementMode: "matched-play",
      })
    )
    .filter(
      (team) =>
        teamPlaysGameType(team, gameType) && withinTeamValue(team, teamValue)
    );
  const team = fitting[Math.floor(random() * fitting.length)];
  if (!team) return null;
  delete team.computerCoached;
  delete team.computerTemplateId;
  team.coachName = "House Bot";
  return team;
}
