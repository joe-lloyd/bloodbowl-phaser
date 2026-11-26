import { fixtureValue } from "../../src/testing/fixtureValue";
import { expect } from "vitest";
import { createComputerTeam } from "../fixtures/computerTeam";
import { getRosterByRosterName } from "../../src/data/RosterTemplates";
import {
  type PlannedPurchase,
  applyPurchase,
} from "../../src/game/rules/purchasePlanner";
import { validateInsignificant } from "../../src/game/rules/insignificant";
import { SkillType } from "../../src/types/Skills";
import { PositionKeyWord, createPlayer } from "../../src/types/Player";
import { RosterName, type Team } from "../../src/types/Team";

export function leagueTeam(
  roster: RosterName,
  {
    players = 7,
    treasury = 0,
    rerolls,
  }: { players?: number; treasury?: number; rerolls?: number } = {}
): Team {
  const team = createComputerTeam({ rosterName: roster, name: `${roster} XI`, primaryColour: 0x335577, advancementMode: "advanced-league" });
  team.firstMatchPlayedAt = 1;
  team.players = team.players.slice(0, players);

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

export function offerJourneyman(team: Team, number: number, spp = 0): string {
  const lineman = getRosterByRosterName(team.rosterName).playerTemplates[0];
  const journeyman = createPlayer(
    fixtureValue(lineman),
    team.id,
    number,
    `Journeyman #${String(number)}`
  );
  journeyman.id = `${team.id}-journeyman-${String(number)}`;
  journeyman.playerKind = "journeyman";
  journeyman.spp = spp;
  team.players.push(journeyman);
  const offerId = `journeyman-m-${String(number)}`;
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

export function applyAll(team: Team, plan: PlannedPurchase[]): void {
  for (const item of plan) applyPurchase(team, item);
}

export function snotlingsAtTheLimit(): Team {
  const team = leagueTeam(RosterName.SNOTLING, {
    players: 0,
    treasury: 300_000,
  });
  const templates = getRosterByRosterName(RosterName.SNOTLING).playerTemplates;
  const insignificant = (template: (typeof templates)[number]) =>
    template.skills.some((skill) => skill.type === SkillType.INSIGNIFICANT);
  const significant = templates.filter((template) => !insignificant(template));
  const snotling = fixtureValue(templates.find(insignificant));
  const picks = significant.flatMap((template) =>
    Array.from({ length: template.maxAllowed ?? 1 }, () => template)
  );
  team.players = [...picks.slice(0, 4), ...Array.from({ length: 4 }, () => snotling)].map(
    (template, index) => createPlayer(template, team.id, index + 1)
  );
  team.rerolls = 6;
  team.apothecary = true;
  team.coaches = 3;
  team.cheerleaders = 3;
  expect(validateInsignificant(team.players)).toBeNull();
  return team;
}
