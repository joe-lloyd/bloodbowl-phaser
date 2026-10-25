/**
 * Legal Sevens line-ups that field each roster's positionals, so simulated
 * matches exercise the skills real teams bring: Block, Guard, Frenzy, big
 * guy negatraits, Bloodlust and the rest.
 *
 * TeamFactory's test teams stay as they are: scenario tests address their
 * players by roster index, and many rosters there are all Linemen.
 */

import {
  Team,
  RosterName,
  AdditionalRule,
  createTeam,
  addPlayerToTeam,
} from "../types/Team";
import { createPlayer, PlayerTemplate, TraitKeyWord } from "../types/Player";
import { getRosterByRosterName } from "../data/RosterTemplates";
import { chooseFirstLinemanAsVeteran } from "../game/rules/veteran";
import {
  isLinemanPosition,
  MAX_NON_LINEMEN,
} from "../game/rules/rosterLegality";
import { hasSkill, SkillType } from "../types/Skills";

/** Seven to start, two in reserve for injuries and Sweltering Heat. */
const LINEUP_SIZE = 9;
const BUDGET = 600_000;

const insignificant = (template: PlayerTemplate) =>
  hasSkill(template.skills, SkillType.INSIGNIFICANT);

/**
 * Up to four different positionals, most expensive first, within roster
 * limits and the draft budget, then Linemen up to nine players. Insignificant
 * Linemen are capped so they never outnumber the rest.
 */
export function lineupTemplates(rosterName: RosterName): PlayerTemplate[] {
  const roster = getRosterByRosterName(rosterName);
  const linemen = roster.playerTemplates.filter((t) =>
    isLinemanPosition(t.keywords)
  );
  const lineman = [...linemen].sort(
    (a, b) => (b.maxAllowed ?? 99) - (a.maxAllowed ?? 99) || a.cost - b.cost
  )[0];
  const positionals = roster.playerTemplates
    .filter((t) => !isLinemanPosition(t.keywords))
    .sort((a, b) => b.cost - a.cost);

  const oneBigGuy = roster.additionalRules.includes(
    AdditionalRule.ONLY_ALLOWED_ONE_BIG_GUY
  );
  const bigGuy = (t: PlayerTemplate) =>
    t.keywords.includes(TraitKeyWord.BIG_GUY);
  const picked: PlayerTemplate[] = [];
  const count = (t: PlayerTemplate) => picked.filter((p) => p === t).length;
  let spent = 0;
  // Round-robin over positions so a line-up shows as many kinds as it can.
  for (
    let pass = 0;
    picked.length < MAX_NON_LINEMEN && pass < MAX_NON_LINEMEN;
    pass++
  ) {
    for (const template of positionals) {
      if (picked.length >= MAX_NON_LINEMEN) break;
      if (
        template.maxAllowed !== undefined &&
        count(template) >= template.maxAllowed
      )
        continue;
      if (oneBigGuy && bigGuy(template) && picked.some(bigGuy)) continue;
      const linemenStillNeeded = Math.max(0, 7 - picked.length - 1);
      if (spent + template.cost + linemenStillNeeded * lineman.cost > BUDGET)
        continue;
      picked.push(template);
      spent += template.cost;
    }
  }

  const significant = picked.filter((t) => !insignificant(t)).length;
  const insignificantPicked = picked.length - significant;
  let linemenCount = LINEUP_SIZE - picked.length;
  if (insignificant(lineman)) {
    linemenCount = Math.min(
      linemenCount,
      Math.max(0, significant - insignificantPicked)
    );
  }
  linemenCount = Math.min(linemenCount, lineman.maxAllowed ?? linemenCount);
  while (linemenCount > 0 && spent + linemenCount * lineman.cost > BUDGET)
    linemenCount--;

  return [...picked, ...Array.from({ length: linemenCount }, () => lineman)];
}

export function createLineupTeam(
  rosterName: RosterName,
  name: string,
  color: number
): Team {
  const roster = getRosterByRosterName(rosterName);
  const team = createTeam(
    name,
    rosterName,
    { primary: color, secondary: 0xffffff },
    roster.rerollCost,
    BUDGET
  );
  lineupTemplates(rosterName).forEach((template, index) => {
    addPlayerToTeam(team, createPlayer(template, team.id, index + 1));
  });
  chooseFirstLinemanAsVeteran(team);
  return team;
}
