import type {
  RosterName,
  Team,
  TeamAdvancementMode,
} from "../../src/types/Team";
import {
  createComputerTeamFromTemplate,
  getComputerTeamTemplates,
} from "../../src/competition/computerTeamTemplates";

export function createComputerTeam({
  rosterName,
  name,
  primaryColour,
  advancementMode,
}: {
  rosterName: RosterName;
  name: string;
  primaryColour: number;
  advancementMode: TeamAdvancementMode;
}): Team {
  const template = getComputerTeamTemplates().find(
    (candidate) => candidate.rosterName === rosterName
  );
  if (!template)
    throw new Error(`No legal computer template for ${rosterName}.`);
  const team = createComputerTeamFromTemplate(template.id, { advancementMode });
  team.name = name;
  team.colors.primary = primaryColour;
  return team;
}
