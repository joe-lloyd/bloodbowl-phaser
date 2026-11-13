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
import { releaseJourneyman } from "../game/rules/journeymen";
import { isActiveTeam } from "../game/rules/teamLifecycle";
import {
  applyPurchase,
  describePurchase,
  fitPlayers,
  journeymanOffers,
  planPurchases,
} from "../game/rules/purchasePlanner";
import { MIN_ROSTER_PLAYERS } from "../game/rules/rosterLegality";
import {
  describeExpensiveMistakes,
  resolveExpensiveMistakes,
} from "../game/rules/expensiveMistakes";
import { IRNGService } from "../services/rng/RNGService";
import { createReadyMadeTeam } from "../simulation/lineups";
import { Player } from "../types/Player";
import {
  calculateTeamValue,
  isLeagueMode,
  isPendingRecruit,
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

/**
 * A team name not in `taken`, such as "Nuln Bonecrushers", from a place and
 * a nickname no taken name uses while any are left.
 */
export function computerTeamName(
  taken: ReadonlySet<string>,
  random: () => number = Math.random
): string {
  const names = [...taken];
  const unused = (
    words: string[],
    inName: (name: string, word: string) => boolean
  ) => {
    const left = words.filter(
      (word) => !names.some((name) => inName(name, word))
    );
    return left.length > 0 ? left : words;
  };
  const places = unused(PLACES, (name, place) => name.startsWith(`${place} `));
  const nicknames = unused(NICKNAMES, (name, nickname) =>
    name.includes(` ${nickname}`)
  );
  const pick = (list: string[]) => list[Math.floor(random() * list.length)];
  for (let attempt = 0; attempt < 50; attempt++) {
    const name = `${pick(places)} ${pick(nicknames)}`;
    if (!taken.has(name)) return name;
  }
  for (let number = 2; ; number++) {
    const name = `${pick(places)} ${pick(nicknames)} ${number}`;
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
 * SPP, spend its Treasury (purchasePlanner.ts), and last roll any Expensive
 * Mistakes, the post-game sequence's final money step. Changes `team` in
 * place; the caller saves it. A team a person coaches is never touched.
 */
export function manageComputerTeam(team: Team, rng: Rng): ManagementReport {
  const report: ManagementReport = { done: [], setbacks: [], refused: [] };
  if (!team.computerCoached) return report;
  const waiting = () =>
    team.pendingDevelopment?.find(
      (candidate) =>
        candidate.kind !== "expensive-mistakes" &&
        candidate.kind !== "journeyman-offer"
    );
  for (let guard = 0; guard < 40 && waiting(); guard++) {
    const entry = waiting()!;
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
  spendTreasury(team, report);
  for (const entry of [...(team.pendingDevelopment ?? [])]) {
    if (entry.kind !== "expensive-mistakes") continue;
    try {
      const result = resolveExpensiveMistakes(team, entry, rng);
      report.done.push(
        `${team.name}: Expensive Mistakes, ${describeExpensiveMistakes(result)}`
      );
    } catch (cause) {
      report.refused.push({
        rule: "development-expensive-mistakes",
        detail: `${team.name}: ${cause}`,
      });
    }
  }
  team.teamValue = calculateTeamValue(team);
  return report;
}

/**
 * Manage every computer team of a competition held in this coach's
 * library, or only those of `entrantIds`, and save those that changed.
 */
export function manageComputerTeams(
  competition: CompetitionDoc,
  rng: Rng,
  entrantIds?: readonly (string | null)[]
): ManagementReport[] {
  return competition.entrants.flatMap((entrant) => {
    if (!entrant.computerCoached) return [];
    if (entrantIds && !entrantIds.includes(entrant.id)) return [];
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
    case "journeyman-offer":
      // Hired or let go with the Treasury, by spendTreasury
      return;
    case "expensive-mistakes":
      // Rolled after hiring, by manageComputerTeam
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
    // A Journeyman's SPP waits until they are hired
    if (isPendingRecruit(team, player.id)) continue;
    for (let guard = 0; guard < 10 && canAdvance(player); guard++) {
      let choice: AdvancementChoice | null = null;
      try {
        choice = advancementChoice(player, nextAdvancementCosts(player)!, rng);
        if (!choice) break;
        applyAdvancement(player, choice);
        report.done.push(
          `${team.name}: ${player.playerName} took ${describeChoice(choice)}`
        );
      } catch (cause) {
        report.refused.push({
          rule: "advancement-refused",
          detail: `${team.name} ${player.playerName}${choice ? ` ${describeChoice(choice)}` : ""}: ${cause}`,
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

/**
 * Between league fixtures, buy what the purchase planner chooses through
 * the same code a coach's purchase runs, then let go every Journeyman not
 * hired. A team still at its draft, or one outside a league (Matched Play),
 * keeps its Treasury as it is.
 */
function spendTreasury(team: Team, report: ManagementReport): void {
  if (!isLeagueMode(team.advancementMode) || !isActiveTeam(team)) return;
  for (const item of planPurchases(team)) {
    try {
      applyPurchase(team, item);
      report.done.push(`${team.name}: ${describePurchase(item)}`);
    } catch (cause) {
      report.refused.push({
        rule: "purchase-refused",
        detail: `${team.name} ${describePurchase(item)}: ${cause}`,
      });
    }
  }
  for (const offer of journeymanOffers(team)) {
    const player = team.players.find((p) => p.id === offer.playerId);
    releaseJourneyman(team, offer);
    report.done.push(
      `${team.name}: Journeyman ${player?.playerName ?? offer.playerId} let go`
    );
  }
  const fit = fitPlayers(team).length;
  if (fit < MIN_ROSTER_PLAYERS)
    report.setbacks.push({
      rule: "cannot-refill",
      detail: `${team.name}: ${fit} fit players, ${team.treasury} in the Treasury`,
    });
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
