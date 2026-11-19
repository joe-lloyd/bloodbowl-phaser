import {
  COMPUTER_TEAM_CATALOGUE,
  type ComputerTeamTemplate,
} from "../data/computerTeamCatalogue";
import { getRosterByRosterName } from "../data/RosterTemplates";
import { createPlayer } from "../types/Player";
import {
  addPlayerToTeam,
  calculateTeamValue,
  createTeam,
  lockAdvancementMode,
  type Team,
  type TeamAdvancementMode,
} from "../types/Team";
import { validateRosterLegality } from "../game/rules/rosterLegality";
import { validateInsignificant } from "../game/rules/insignificant";
import { chooseFirstLinemanAsVeteran } from "../game/rules/veteran";
import { purchase } from "../game/rules/teamPricing";
import {
  DEFAULT_SEVENS_RULESET,
  type SevensRuleset,
} from "../game/rules/sevensRuleset";
import { allocateMatchedPlaySkill } from "../game/progression/advancementModes";
import { eligibleSkills } from "../game/progression/progression";

export const COMPUTER_COACH = "Computer";

interface TemplateOptions {
  advancementMode?: TeamAdvancementMode;
  ruleset?: SevensRuleset;
}

function buildTemplate(
  template: ComputerTeamTemplate,
  options: TemplateOptions
): Team {
  const roster = getRosterByRosterName(template.rosterName);
  const team = createTeam(
    template.name,
    template.rosterName,
    { ...template.colors },
    roster.rerollCost,
    600_000,
    options.advancementMode
  );
  team.computerCoached = true;
  team.computerTemplateId = template.id;
  team.coachName = COMPUTER_COACH;
  team.draftRuleset = options.ruleset ?? DEFAULT_SEVENS_RULESET;
  for (const [position, count] of template.players) {
    const playerTemplate = roster.playerTemplates.find(
      (player) => player.positionName === position
    );
    if (!playerTemplate)
      throw new Error(`Unknown ${template.rosterName} position: ${position}.`);
    for (let index = 0; index < count; index++) {
      const player = createPlayer(
        structuredClone(playerTemplate),
        team.id,
        team.players.length + 1
      );
      if (!addPlayerToTeam(team, player))
        throw new Error(`${template.name} cannot afford its starting players.`);
    }
  }
  for (let index = 0; index < template.rerolls; index++)
    purchase(team, { type: "reroll" });
  chooseFirstLinemanAsVeteran(team);
  if (options.advancementMode === "matched-play") {
    for (const player of team.players) {
      const skill = eligibleSkills(player, player.primary ?? [])[0];
      if (skill) {
        allocateMatchedPlaySkill(team, roster, player, skill, "primary");
        break;
      }
    }
  }
  lockAdvancementMode(team);
  team.teamValue = calculateTeamValue(team);
  return team;
}

function draftIssues(team: Team): string[] {
  return [
    ...validateRosterLegality(team, getRosterByRosterName(team.rosterName)).map(
      (issue) => issue.detail
    ),
    validateInsignificant(team.players, team.draftRuleset),
  ].filter((issue): issue is string => issue !== null);
}

export function getComputerTeamTemplates(
  ruleset: SevensRuleset = DEFAULT_SEVENS_RULESET
): readonly ComputerTeamTemplate[] {
  return COMPUTER_TEAM_CATALOGUE.filter((template) => {
    try {
      const team = buildTemplate(template, { ruleset });
      return draftIssues(team).length === 0;
    } catch {
      return false;
    }
  });
}

export function createComputerTeamFromTemplate(
  templateId: string,
  options: TemplateOptions = {}
): Team {
  const template = COMPUTER_TEAM_CATALOGUE.find(
    (candidate) => candidate.id === templateId
  );
  if (!template) throw new Error("Unknown computer team template.");
  const team = buildTemplate(template, options);
  const issues = draftIssues(team);
  if (issues.length > 0)
    throw new Error(`${template.name} is not legal: ${issues.join(" ")}`);
  return team;
}
