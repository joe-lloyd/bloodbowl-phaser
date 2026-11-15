/**
 * The computer league teams the purchase planner tests share, and the way
 * they apply a plan.
 */

import { expect } from "vitest";
import { createComputerTeam } from "../../src/competition/computerTeams";
import { getRosterByRosterName } from "../../src/data/RosterTemplates";
import {
  PlannedPurchase,
  applyPurchase,
} from "../../src/game/rules/purchasePlanner";
import { validateInsignificant } from "../../src/game/rules/insignificant";
import { SkillType } from "../../src/types/Skills";
import { PositionKeyWord, createPlayer } from "../../src/types/Player";
import { RosterName, Team } from "../../src/types/Team";

/** A computer league team after its first fixture. */
export function leagueTeam(
  roster: RosterName,
  {
    players = 7,
    treasury = 0,
    rerolls,
  }: { players?: number; treasury?: number; rerolls?: number } = {}
): Team {
  const team = createComputerTeam(
    roster,
    `${roster} XI`,
    0x335577,
    "advanced-league"
  );
  team.firstMatchPlayedAt = 1;
  team.players = team.players.slice(0, players);
  // More than the ready-made 7: Linemen in the next numbers
  const lineman = getRosterByRosterName(roster).playerTemplates.find(
    (template) => template.keywords.includes(PositionKeyWord.LINEMAN)
  );
  for (
    let number = team.players.length + 1;
    lineman && number <= players;
    number++
  )
    team.players.push(createPlayer(lineman, team.id, number));
  team.treasury = treasury;
  if (rerolls !== undefined) team.rerolls = rerolls;
  return team;
}

/** A Journeyman who played and waits on a hiring decision. */
export function offerJourneyman(team: Team, number: number, spp = 0): string {
  const lineman = getRosterByRosterName(team.rosterName).playerTemplates[0];
  const journeyman = createPlayer(
    lineman,
    team.id,
    number,
    `Journeyman #${number}`
  );
  journeyman.id = `${team.id}-journeyman-${number}`;
  journeyman.playerKind = "journeyman";
  journeyman.spp = spp;
  team.players.push(journeyman);
  const offerId = `journeyman-m-${number}`;
  (team.pendingDevelopment ??= []).push({
    id: offerId,
    kind: "journeyman-offer",
    playerId: journeyman.id,
    matchId: "m",
    createdAt: 1,
  });
  return offerId;
}

export const reasons = (plan: PlannedPurchase[]) =>
  plan.map((item) => item.reason);
export const spent = (plan: PlannedPurchase[]) =>
  plan.reduce((sum, item) => sum + item.price, 0);

/** Apply a plan the way the computer does, through the coach's code. */
export function applyAll(team: Team, plan: PlannedPurchase[]): void {
  for (const item of plan) applyPurchase(team, item);
}

/**
 * An active Snotling team whose list holds as many Insignificant Snotling
 * Linemen as other players, 4 and 4, with gold to spare.
 */
export function snotlingsAtTheLimit(): Team {
  const team = leagueTeam(RosterName.SNOTLING, {
    players: 0,
    treasury: 300_000,
  });
  const templates = getRosterByRosterName(RosterName.SNOTLING).playerTemplates;
  const insignificant = (template: (typeof templates)[number]) =>
    template.skills.some((skill) => skill.type === SkillType.INSIGNIFICANT);
  const significant = templates.filter((template) => !insignificant(template));
  const snotling = templates.find(insignificant)!;
  const picks = significant.flatMap((template) =>
    Array(template.maxAllowed ?? 1).fill(template)
  );
  team.players = [...picks.slice(0, 4), ...Array(4).fill(snotling)].map(
    (template, index) => createPlayer(template, team.id, index + 1)
  );
  team.rerolls = 6;
  team.apothecary = true;
  team.coaches = 3;
  team.cheerleaders = 3;
  expect(validateInsignificant(team.players)).toBeNull();
  return team;
}
