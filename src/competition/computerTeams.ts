/**
 * Computer-coached teams. The computer builds them for a competition, plays
 * them, and between games makes the choices a keen coach would make from
 * Manage Team, so their development and injuries carry from game to game
 * the way a person's team does.
 */

import { getRosterByRosterName } from "../data/RosterTemplates";
import { getTeamById, saveTeam } from "../game/managers/TeamManager";
import {
  allocateMatchedPlaySkill,
  chooseSecondarySkill,
  draftedPlayerPrice,
  keepDraftedPlayer,
  nominatePrimarySkill,
  releaseDraftedPlayer,
  rollPrimarySelection,
  rollSecondaryCandidates,
  skillSelectionDecision,
  startPrimarySelection,
  startSecondarySelection,
} from "../game/progression/advancementModes";
import {
  AdvancementChoice,
  applyAdvancement,
  canAdvance,
  characteristicChoices,
  eligibleSkills,
  mustAdvance,
  nextAdvancementCosts,
  rollRandomPrimaryCandidates,
} from "../game/progression/progression";
import {
  canKeepRaisedDead,
  resolveRaisedDeadRecruit,
} from "../game/rules/raiseDead";
import { canEdit } from "../game/rules/teamEditLegality";
import { priceOf } from "../game/rules/teamPricing";
import { IRNGService } from "../services/rng/RNGService";
import { createReadyMadeTeam } from "../simulation/lineups";
import { createPlayer, Player, PositionKeyWord } from "../types/Player";
import {
  addPlayerToTeam,
  calculateTeamValue,
  PendingDevelopment,
  RosterName,
  startingDedicatedFans,
  Team,
  TeamAdvancementMode,
} from "../types/Team";
import { CompetitionDoc } from "./types";

type Rng = Pick<IRNGService, "rollDie">;

export const COMPUTER_COACH = "Computer";

const PLACES = [
  "Altdorf",
  "Middenheim",
  "Nuln",
  "Talabheim",
  "Marienburg",
  "Averheim",
  "Karak Varn",
  "Praag",
  "Erengrad",
  "Bögenhafen",
  "Wissenburg",
  "Grimminhagen",
  "Mordheim",
  "Sylvania",
  "Lustria",
  "Naggaroth",
];

const NICKNAMES = [
  "Marauders",
  "Reavers",
  "Bonecrushers",
  "Gutrippers",
  "Nightmares",
  "Hammers",
  "Warhawks",
  "Grudgebearers",
  "Ravagers",
  "Stormcrows",
  "Butchers",
  "Wolves",
  "Avengers",
  "Bloodletters",
  "Ironhides",
  "Screamers",
];

/** A team name not in `taken`, such as "Nuln Bonecrushers". */
export function computerTeamName(
  taken: ReadonlySet<string>,
  random: () => number = Math.random
): string {
  const pick = <T>(list: T[]) => list[Math.floor(random() * list.length)];
  for (let attempt = 0; attempt < 50; attempt++) {
    const name = `${pick(PLACES)} ${pick(NICKNAMES)}`;
    if (!taken.has(name)) return name;
  }
  for (let number = 2; ; number++) {
    const name = `${pick(PLACES)} ${pick(NICKNAMES)} ${number}`;
    if (!taken.has(name)) return name;
  }
}

/** A ready-made legal team for the computer to coach. */
export function createComputerTeam(
  rosterName: RosterName,
  name: string,
  primaryColour: number,
  advancementMode: TeamAdvancementMode
): Team {
  const team = createReadyMadeTeam(rosterName, name, primaryColour);
  team.coachName = COMPUTER_COACH;
  team.computerCoached = true;
  // Team Builder picks the mode when the team is created
  team.advancementMode = advancementMode;
  team.advancementModeLocked = true;
  team.dedicatedFans = startingDedicatedFans(advancementMode);
  if (advancementMode === "matched-play") {
    // Matched Play buys its skills at creation: one Primary skill
    const roster = getRosterByRosterName(rosterName);
    for (const player of team.players) {
      const skill = eligibleSkills(player, player.primary ?? [])[0];
      if (!skill) continue;
      try {
        allocateMatchedPlaySkill(team, roster, player, skill, "primary");
        break;
      } catch {
        // Too dear for this player; try the next
      }
    }
  }
  team.teamValue = calculateTeamValue(team);
  return team;
}

export interface ManagementReport {
  /** What the computer did, in order. */
  done: string[];
  /** Within the rules, but a loss: drafted players, a roster left short. */
  setbacks: { rule: "drafted-away" | "cannot-refill"; detail: string }[];
  /** A choice the rules refused. The computer skipped it. */
  refused: { rule: string; detail: string }[];
}

/**
 * Resolve every development choice waiting on a computer team, spend its
 * SPP, and hire Linemen back up to seven players. Changes `team` in place;
 * the caller saves it.
 */
export function manageComputerTeam(team: Team, rng: Rng): ManagementReport {
  const report: ManagementReport = { done: [], setbacks: [], refused: [] };
  for (
    let guard = 0;
    guard < 40 && (team.pendingDevelopment?.length ?? 0) > 0;
    guard++
  ) {
    const entry = team.pendingDevelopment![0];
    try {
      resolveEntry(team, entry, rng, report);
    } catch (cause) {
      report.refused.push({
        rule: `development-${entry.kind}`,
        detail: `${team.name}: ${cause}`,
      });
      team.pendingDevelopment = team.pendingDevelopment!.filter(
        (candidate) => candidate.id !== entry.id
      );
    }
  }
  spendSpp(team, rng, report);
  hireUpToSeven(team, report);
  team.teamValue = calculateTeamValue(team);
  return report;
}

/**
 * Manage every computer team of a competition held in this coach's
 * library, and save those that changed.
 */
export function manageComputerTeams(
  competition: CompetitionDoc,
  rng: Rng
): ManagementReport[] {
  return competition.entrants.flatMap((entrant) => {
    if (!entrant.computerCoached) return [];
    const team = getTeamById(entrant.teamId);
    if (!team) return [];
    const before = JSON.stringify(team);
    const report = manageComputerTeam(team, rng);
    if (JSON.stringify(team) !== before) saveTeam(team);
    return [report];
  });
}

function resolveEntry(
  team: Team,
  entry: PendingDevelopment,
  rng: Rng,
  report: ManagementReport
): void {
  switch (entry.kind) {
    case "raised-dead-recruit": {
      const keep = canKeepRaisedDead(team, entry.playerId);
      resolveRaisedDeadRecruit(team, entry, keep);
      report.done.push(
        `${team.name}: raised dead ${keep ? "hired" : "let go"}`
      );
      return;
    }
    case "advanced-league-advancement": {
      const player = team.players.find((p) => p.id === entry.playerId);
      const choice =
        player && advancementChoice(player, nextAdvancementCosts(player)!, rng);
      if (!player || !choice) {
        team.pendingDevelopment = team.pendingDevelopment!.filter(
          (candidate) => candidate.id !== entry.id
        );
        if (player) throw new Error(`no advancement for ${player.playerName}`);
        return;
      }
      applyAdvancement(player, choice);
      if (!mustAdvance(player))
        team.pendingDevelopment = team.pendingDevelopment!.filter(
          (candidate) => candidate.id !== entry.id
        );
      report.done.push(
        `${team.name}: ${player.playerName} took ${describeChoice(choice)}`
      );
      return;
    }
    case "sevens-skill-selection":
      resolveSkillSelection(team, entry, rng, report);
      return;
    case "drafted-player-offer": {
      const player = team.players.find((p) => p.id === entry.playerId)!;
      // Keep every drafted player the Treasury can pay for
      const keep = draftedPlayerPrice(player) <= team.treasury;
      if (keep) keepDraftedPlayer(team, entry);
      else releaseDraftedPlayer(team, entry);
      report.done.push(
        `${team.name}: drafted ${player.playerName} ${keep ? "kept" : "released"}`
      );
      return;
    }
  }
}

/** Spend what each player has earned, as a keen coach would. */
function spendSpp(team: Team, rng: Rng, report: ManagementReport): void {
  for (const player of team.players) {
    for (let guard = 0; guard < 10 && canAdvance(player); guard++) {
      const choice = advancementChoice(
        player,
        nextAdvancementCosts(player)!,
        rng
      );
      if (!choice) break;
      try {
        applyAdvancement(player, choice);
        report.done.push(
          `${team.name}: ${player.playerName} took ${describeChoice(choice)}`
        );
      } catch (cause) {
        report.refused.push({
          rule: "advancement-refused",
          detail: `${team.name} ${player.playerName} ${describeChoice(choice)}: ${cause}`,
        });
        break;
      }
    }
  }
}

function describeChoice(choice: AdvancementChoice): string {
  return choice.kind === "characteristic"
    ? `+1 ${choice.stat}`
    : `${choice.kind} ${choice.skill}`;
}

/** Save for a characteristic once close; otherwise take what is affordable. */
function advancementChoice(
  player: Player,
  costs: NonNullable<ReturnType<typeof nextAdvancementCosts>>,
  rng: Rng
): AdvancementChoice | null {
  const spp = player.spp ?? 0;
  if (spp >= costs.characteristic) {
    const roll = rng.rollDie(8);
    const stats = characteristicChoices(player, roll);
    if (stats.length > 0)
      return { kind: "characteristic", roll, stat: stats[0] };
    const skill = eligibleSkills(player, player.primary ?? [])[0];
    return skill
      ? { kind: "characteristic-fallback", roll, skill, access: "primary" }
      : null;
  }
  if (spp >= costs.chosenSecondary && (player.secondary ?? []).length > 0) {
    const skill = eligibleSkills(player, player.secondary ?? [])[0];
    if (skill) return { kind: "chosen-secondary", skill };
  }
  if (spp >= costs.chosenPrimary) {
    const options = eligibleSkills(player, player.primary ?? []);
    if (options.length > 0)
      return {
        kind: "chosen-primary",
        skill: options[rng.rollDie(options.length) - 1],
      };
  }
  const category = (player.primary ?? [])[0];
  if (!category) return null;
  const [first] = rollRandomPrimaryCandidates(player, category, rng);
  return { kind: "random-primary", skill: first.skill };
}

/** A league team short of seven hires Linemen from the Treasury. */
function hireUpToSeven(team: Team, report: ManagementReport): void {
  if (team.players.length >= 7) return;
  if (!canEdit(team, { type: "hire-player" }).allowed) return;
  const template = getRosterByRosterName(team.rosterName).playerTemplates.find(
    (candidate) => candidate.keywords.includes(PositionKeyWord.LINEMAN)
  );
  if (!template) return;
  while (team.players.length < 7) {
    const price = priceOf(team, { type: "player", cost: template.cost });
    if (price.amount == null || team.treasury < price.amount) {
      report.setbacks.push({
        rule: "cannot-refill",
        detail: `${team.name}: ${team.players.length} players, ${team.treasury} in the Treasury`,
      });
      return;
    }
    const used = new Set(team.players.map((p) => p.number));
    let number = 1;
    while (used.has(number)) number++;
    const player = createPlayer(template, team.id, number);
    player.cost = price.amount;
    if (!addPlayerToTeam(team, player)) return;
    report.done.push(`${team.name}: hired ${player.playerName}`);
  }
}

function resolveSkillSelection(
  team: Team,
  entry: Extract<PendingDevelopment, { kind: "sevens-skill-selection" }>,
  rng: Rng,
  report: ManagementReport
): void {
  const draftedAway = (released: { playerName: string }[]) => {
    for (const record of released)
      report.setbacks.push({
        rule: "drafted-away",
        detail: `${team.name}: ${record.playerName}, Treasury ${team.treasury}`,
      });
  };
  const wantSecondary = rng.rollDie(3) === 1;
  for (let step = 0; step < 10; step++) {
    if (!team.pendingDevelopment?.some((e) => e.id === entry.id)) return;
    const decision = skillSelectionDecision(team, entry);
    switch (decision.type) {
      case "choose-route": {
        if (
          (wantSecondary || decision.primaryOptions.length === 0) &&
          decision.secondaryAvailable
        ) {
          startSecondarySelection(team, entry, rng);
        } else if (decision.primaryOptions.length > 0) {
          const option =
            decision.primaryOptions[
              rng.rollDie(decision.primaryOptions.length) - 1
            ];
          startPrimarySelection(
            team,
            entry,
            option.playerId,
            option.categories[0]
          );
        } else {
          throw new Error("no Skill Selection route is available");
        }
        break;
      }
      case "name-primary-skill":
        nominatePrimarySkill(
          team,
          entry,
          decision.chooser,
          decision.options[rng.rollDie(decision.options.length) - 1]
        );
        break;
      case "roll-primary-d3": {
        const result = rollPrimarySelection(team, entry, rng);
        report.done.push(
          `${team.name}: Skill Selection primary ${result.skill} (D3 ${result.d3})`
        );
        draftedAway(result.draft.released);
        return;
      }
      case "choose-secondary-category":
        rollSecondaryCandidates(team, entry, decision.categories[0], rng);
        break;
      case "choose-secondary-skill": {
        const result = chooseSecondarySkill(
          team,
          entry,
          decision.candidates[0].skill,
          rng
        );
        report.done.push(
          `${team.name}: Skill Selection secondary ${result.skill}`
        );
        draftedAway(result.draft.released);
        return;
      }
    }
  }
  throw new Error("Skill Selection took ten steps without finishing");
}
