/**
 * Legal Sevens line-ups that field each roster's positionals, so simulated
 * matches exercise the skills real teams bring: Block, Guard, Frenzy, big
 * guy negatraits, Bloodlust and the rest.
 *
 * TeamFactory's test teams stay as they are: scenario tests address their
 * players by roster index, and many rosters there are all Linemen.
 */

import { Team, RosterName, createTeam, addPlayerToTeam } from "../types/Team";
import { createPlayer, PlayerTemplate } from "../types/Player";
import { getRosterByRosterName } from "../data/RosterTemplates";
import { chooseFirstLinemanAsVeteran } from "../game/rules/veteran";
import {
  isBigGuy,
  isLinemanPosition,
  MAX_NON_LINEMEN,
} from "../game/rules/rosterLegality";
import { hasSkill, SkillType } from "../types/Skills";
import { purchase } from "../game/rules/teamPricing";

/** Seven to start, two in reserve for injuries and Sweltering Heat. */
const LINEUP_SIZE = 9;
const BUDGET = 600_000;
/** The most team re-rolls a ready-made team buys before its players. */
const READY_MADE_REROLLS = 2;

const insignificant = (template: PlayerTemplate) =>
  hasSkill(template.skills, SkillType.INSIGNIFICANT);

/** Whether one more of `template` stays within its own and the big guy limit. */
function withinRosterLimits(
  template: PlayerTemplate,
  picked: PlayerTemplate[],
  maxBigGuys: number | undefined
): boolean {
  if (
    template.maxAllowed !== undefined &&
    picked.filter((p) => p === template).length >= template.maxAllowed
  )
    return false;
  return (
    maxBigGuys === undefined ||
    !isBigGuy(template.keywords) ||
    picked.filter((t) => isBigGuy(t.keywords)).length < maxBigGuys
  );
}

/** Linemen to fill the line-up to nine with what is left of the budget. */
function linemenToAdd(
  picked: PlayerTemplate[],
  lineman: PlayerTemplate,
  spent: number,
  budget: number
): number {
  const significant = picked.filter((t) => !insignificant(t)).length;
  const insignificantPicked = picked.length - significant;
  let count = LINEUP_SIZE - picked.length;
  if (insignificant(lineman)) {
    count = Math.min(count, Math.max(0, significant - insignificantPicked));
  }
  count = Math.min(count, lineman.maxAllowed ?? count);
  while (count > 0 && spent + count * lineman.cost > budget) count--;
  return count;
}

/**
 * Up to four different positionals, most expensive first, within roster
 * limits and the budget, then Linemen up to nine players. Insignificant
 * Linemen are capped so they never outnumber the rest.
 */
export function lineupTemplates(
  rosterName: RosterName,
  budget = BUDGET
): PlayerTemplate[] {
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

  const picked: PlayerTemplate[] = [];
  let spent = 0;
  // Round-robin over positions so a line-up shows as many kinds as it can.
  for (
    let pass = 0;
    picked.length < MAX_NON_LINEMEN && pass < MAX_NON_LINEMEN;
    pass++
  ) {
    for (const template of positionals) {
      if (picked.length >= MAX_NON_LINEMEN) break;
      if (!withinRosterLimits(template, picked, roster.maxBigGuys)) continue;
      const linemenStillNeeded = Math.max(0, 7 - picked.length - 1);
      if (spent + template.cost + linemenStillNeeded * lineman.cost > budget)
        continue;
      picked.push(template);
      spent += template.cost;
    }
  }

  const linemenCount = linemenToAdd(picked, lineman, spent, budget);
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

/**
 * A team to play with straight away: as many team re-rolls as it can buy, up
 * to two, while the rest of the draft budget still fields seven players.
 */
export function createReadyMadeTeam(
  rosterName: RosterName,
  name: string,
  color: number
): Team {
  const roster = getRosterByRosterName(rosterName);
  for (let rerolls = READY_MADE_REROLLS; ; rerolls--) {
    const team = createTeam(
      name,
      rosterName,
      { primary: color, secondary: 0xffffff },
      roster.rerollCost,
      BUDGET
    );
    for (let i = 0; i < rerolls; i++) purchase(team, { type: "reroll" });
    const templates = lineupTemplates(rosterName, team.treasury);
    if (templates.length < 7 && rerolls > 0) continue;
    templates.forEach((template, index) => {
      addPlayerToTeam(team, createPlayer(template, team.id, index + 1));
    });
    chooseFirstLinemanAsVeteran(team);
    return team;
  }
}
