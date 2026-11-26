import type { ComputerTeamTemplate } from "../data/computerTeamCatalogue";
import type { SevensRuleset } from "../game/rules/sevensRuleset";
import type { GameType } from "../game/variants/gameTypes";
import type { Team } from "../types/Team";
import {
  createComputerTeamFromTemplate,
  getComputerTeamTemplates,
} from "./computerTeamTemplates";
import { checkTeamCompatibility, type RosterRuleProfile } from "./rosterRules";

type Random = () => number;

function randomItem<T>(items: readonly T[], random: Random): T | undefined {
  return items[Math.floor(random() * items.length)];
}

function nextTemplate({
  templates,
  counts,
  used,
  random,
}: {
  templates: readonly ComputerTeamTemplate[];
  counts: ReadonlyMap<string, number>;
  used: readonly ComputerTeamTemplate[];
  random: Random;
}): ComputerTeamTemplate | undefined {
  const rosters = [...new Set(templates.map((template) => template.rosterName))];
  const fewest = Math.min(...rosters.map((roster) => counts.get(roster) ?? 0));
  const roster = randomItem(
    rosters.filter((candidate) => (counts.get(candidate) ?? 0) === fewest),
    random
  );
  const variants = templates.filter((template) => template.rosterName === roster);
  const unused = variants.filter(
    (template) => used.every((other) => other.id !== template.id)
  );
  return randomItem(unused.length > 0 ? unused : variants, random);
}

export function pickComputerTemplates({
  templates,
  count,
  rosters,
  picked,
  random,
}: {
  templates: readonly ComputerTeamTemplate[];
  count: number;
  rosters: readonly string[];
  picked: readonly ComputerTeamTemplate[];
  random: Random;
}): ComputerTeamTemplate[] {
  const counts = new Map<string, number>();
  for (const roster of [...rosters, ...picked.map((t) => t.rosterName)])
    counts.set(roster, (counts.get(roster) ?? 0) + 1);
  const chosen: ComputerTeamTemplate[] = [];
  for (let index = 0; index < count; index++) {
    const template = nextTemplate({
      templates,
      counts,
      used: [...picked, ...chosen],
      random,
    });
    if (!template) break;
    chosen.push(template);
    counts.set(template.rosterName, (counts.get(template.rosterName) ?? 0) + 1);
  }
  return chosen;
}

interface FillRules {
  ruleset: SevensRuleset;
  gameType: GameType;
}

function fillTeam(
  template: ComputerTeamTemplate,
  { rules, profile }: { rules: FillRules; profile: RosterRuleProfile | undefined }
): Team {
  return createComputerTeamFromTemplate(template.id, {
    ...rules,
    advancementMode: profile?.advancementMode ?? "advanced-league",
  });
}

export function computerFillTeams({
  count,
  rules,
  profile,
  rosters,
  random,
}: {
  count: number;
  rules: FillRules;
  profile: RosterRuleProfile | undefined;
  rosters: readonly string[];
  random: Random;
}): Team[] {
  const options = { rules, profile };
  const templates = getComputerTeamTemplates(rules).filter(
    (template) =>
      checkTeamCompatibility(fillTeam(template, options), profile, rules)
        .compatible
  );
  if (count > 0 && templates.length === 0)
    throw new Error(
      "No computer team fits this competition's roster rules, so the empty places cannot be filled."
    );
  return pickComputerTemplates({ templates, count, rosters, picked: [], random }).map(
    (template) => fillTeam(template, options)
  );
}
