import { InjuryType, type Player } from "../../types/Player";
import { type Team, calculateTeamValue, playerValue } from "../../types/Team";
import { SkillType } from "../../types/Skills";
import { addedSkillCount } from "../progression/advancementModes";
import { getRosterByRosterName } from "../../data/RosterTemplates";
import {
  APOTHECARY_COST,
  ASSISTANT_COACH_COST,
  CHEERLEADER_COST,
  MAX_ASSISTANT_COACHES,
  MAX_CHEERLEADERS,
  MAX_TEAM_REROLLS,
} from "./sevensPrices";
import { teamRerollPrice } from "./teamPricing";
import { thousands } from "./club";
import { teamDraftRules } from "./draftRules";
import { isLinemanPosition } from "./rosterLegality";

export const REDRAFT_BASE_BUDGET = 600_000;
export const REDRAFT_BONUS_PER_WIN = 10_000;
export const CLUB_REDRAFT_CAP = 800_000;
export const AGENT_FEE_PER_SEASON = 20_000;
const MAX_SQUAD = 11;

export interface RedraftChoice {
  keep: readonly string[];
  rerolls: number;
  apothecary: boolean;
  coaches: number;
  cheerleaders: number;
}

export function restAndRelaxation(team: Team, rollD6: () => number): void {
  for (const player of team.players) {
    player.injuries = player.injuries.filter(
      (injury) => injury !== InjuryType.MISS_NEXT_GAME
    );
    const before = player.advancements ?? [];
    const kept = before.filter(
      (advancement) => advancement.name !== SkillType.HATRED || rollD6() < 4
    );
    player.advancements = kept;

    for (let lost = before.length - kept.length; lost > 0; lost--) {
      const index = player.skills
        .map((skill) => skill.type)
        .lastIndexOf(SkillType.HATRED);
      player.skills.splice(index, 1);
    }
  }
}

export function redraftBudget(treasury: number, wins: number): number {
  return Math.min(
    CLUB_REDRAFT_CAP,
    REDRAFT_BASE_BUDGET + treasury + REDRAFT_BONUS_PER_WIN * wins
  );
}

export function rehirePrice(player: Player): number {
  return playerValue(player) + AGENT_FEE_PER_SEASON * (player.seasons ?? 0);
}

function staffCost(team: Team, choice: RedraftChoice): number {
  return (
    choice.rerolls * teamRerollPrice(team) +
    (choice.apothecary ? APOTHECARY_COST : 0) +
    choice.coaches * ASSISTANT_COACH_COST +
    choice.cheerleaders * CHEERLEADER_COST
  );
}

export function redraftCost(team: Team, choice: RedraftChoice): number {
  const players = team.players
    .filter((player) => choice.keep.includes(player.id))
    .reduce((sum, player) => sum + rehirePrice(player), 0);
  return players + staffCost(team, choice);
}

export function currentLineUp(team: Team): RedraftChoice {
  return {
    keep: team.players.map((player) => player.id),
    rerolls: team.rerolls,
    apothecary: team.apothecary,
    coaches: team.coaches,
    cheerleaders: team.cheerleaders,
  };
}

function choiceRefusal(team: Team, choice: RedraftChoice): string | undefined {
  if (choice.rerolls < 0 || choice.rerolls > MAX_TEAM_REROLLS)
    return `A club may have 0 to ${String(MAX_TEAM_REROLLS)} team re-rolls.`;
  if (choice.coaches < 0 || choice.coaches > MAX_ASSISTANT_COACHES)
    return `A club may have 0 to ${String(MAX_ASSISTANT_COACHES)} Assistant Coaches.`;
  if (choice.cheerleaders < 0 || choice.cheerleaders > MAX_CHEERLEADERS)
    return `A club may have 0 to ${String(MAX_CHEERLEADERS)} Cheerleaders.`;
  if (choice.apothecary && !getRosterByRosterName(team.rosterName).apothecary)
    return `${team.rosterName} teams cannot hire an Apothecary.`;
  if (choice.keep.length > MAX_SQUAD)
    return `A club may keep at most ${String(MAX_SQUAD)} players.`;
  return undefined;
}

export function applyRedraft(
  team: Team,
  choice: RedraftChoice,
  budget: number
): string | undefined {
  const refusal = choiceRefusal(team, choice);
  if (refusal) return refusal;
  const cost = redraftCost(team, choice);
  if (cost > budget)
    return `The redraft costs ${thousands(cost)}, more than the budget of ${thousands(budget)}.`;
  team.players = team.players.filter((player) => choice.keep.includes(player.id));
  team.rerolls = choice.rerolls;
  team.apothecary = choice.apothecary;
  team.coaches = choice.coaches;
  team.cheerleaders = choice.cheerleaders;
  team.treasury = budget - cost;
  team.teamValue = calculateTeamValue(team);
  return undefined;
}

function worth(player: Player): number {
  return addedSkillCount(player) * 1_000_000 + player.spp * 1000 + playerValue(player);
}

export function rookiePrice(team: Team): number {
  const templates = getRosterByRosterName(team.rosterName).playerTemplates;
  const linemen = templates.filter((template) => isLinemanPosition(template.keywords));
  return Math.min(...(linemen.length > 0 ? linemen : templates).map((template) => template.cost));
}

export function squadMinimum(team: Team): number {
  return teamDraftRules(team).minPlayers;
}

function bestPlayers(team: Team, budget: number): string[] {
  const keep: string[] = [];
  let spent = 0;
  const rookie = rookiePrice(team);
  const minimum = squadMinimum(team);
  const ranked = [...team.players].sort((a, b) => worth(b) - worth(a));
  for (const player of ranked) {
    const price = rehirePrice(player);
    const rookies = Math.max(0, minimum - keep.length - 1) * rookie;
    if (keep.length === MAX_SQUAD || spent + price + rookies > budget) continue;
    keep.push(player.id);
    spent += price;
  }
  return keep;
}

export function computerRedraftChoice(team: Team, budget: number): RedraftChoice {
  const reroll = teamRerollPrice(team);
  const reserve = team.rerolls > 0 ? reroll : 0;
  const keep = bestPlayers(team, budget - reserve);
  const lineUp = { ...currentLineUp(team), keep, rerolls: 0, apothecary: false, coaches: 0, cheerleaders: 0 };
  const rookies = Math.max(0, squadMinimum(team) - keep.length) * rookiePrice(team);
  let left = budget - redraftCost(team, lineUp) - rookies;
  const rerolls = Math.min(team.rerolls, Math.floor(left / reroll));
  left -= rerolls * reroll;
  const apothecary = team.apothecary && left >= APOTHECARY_COST;
  return { ...lineUp, rerolls, apothecary };
}
