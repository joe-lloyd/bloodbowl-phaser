import { saveTeam } from "../game/managers/TeamManager";
import { ownLocalTeam } from "./teamRefs";
import {
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
  type AdvancementChoice,
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
import { type IRNGService } from "../services/rng/RNGService";
;
import { type Player } from "../types/Player";
import {
  calculateTeamValue,
  isLeagueMode,
  isPendingRecruit,
  type PendingDevelopment,
  type Team,
} from "../types/Team";
import { type CompetitionDoc } from "./types";

type Rng = Pick<IRNGService, "rollDie">;

function rollFrom<T>(items: readonly T[], rng: Rng): T {
  const item = items[rng.rollDie(items.length) - 1];
  if (item === undefined) throw new Error("roll fell outside the list");
  return item;
}

function firstOf<T>(items: readonly T[]): T {
  const [item] = items;
  if (item === undefined) throw new Error("expected a non-empty list");
  return item;
}

export interface ManagementReport {
  done: string[];

  setbacks: { rule: "drafted-away" | "cannot-refill"; detail: string }[];

  refused: { rule: string; detail: string }[];
}

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
      resolveEntry({ team, entry, rng, report });
    } catch (cause) {
      report.refused.push({
        rule: `development-${entry.kind}`,
        detail: `${team.name}: ${String(cause)}`,
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
        detail: `${team.name}: ${String(cause)}`,
      });
    }
  }
  team.teamValue = calculateTeamValue(team);
  return report;
}

export function manageComputerTeams(
  competition: CompetitionDoc,
  rng: Rng,
  entrantIds?: readonly (string | null)[]
): ManagementReport[] {
  return competition.entrants.flatMap((entrant) => {
    if (!entrant.computerCoached) return [];
    if (entrantIds && !entrantIds.includes(entrant.id)) return [];
    const team = ownLocalTeam(entrant);
    if (!team) return [];
    const before = JSON.stringify(team);
    const report = manageComputerTeam(team, rng);
    if (JSON.stringify(team) !== before) saveTeam(team);
    return [report];
  });
}

function resolveEntry({
  team,
  entry,
  rng,
  report,
}: {
  team: Team;
  entry: PendingDevelopment;
  rng: Rng;
  report: ManagementReport;
}): void {
  switch (entry.kind) {
    case "raised-dead-recruit": {
      const keep = canKeepRaisedDead(team, entry.playerId);
      resolveRaisedDeadRecruit(team, entry, keep);
      report.done.push(
        `${team.name}: raised dead ${keep ? "hired" : "let go"}`
      );
      return;
    }
    case "advanced-league-advancement":
      resolveLeagueAdvancement({ team, entry, rng, report });
      return;
    case "sevens-skill-selection":
      resolveSkillSelection({ team, entry, rng, report });
      return;
    case "journeyman-offer":
      return;
    case "expensive-mistakes":
      return;
    case "drafted-player-offer":
      resolveDraftedOffer(team, entry, report);
      return;
  }
}

function resolveLeagueAdvancement({
  team,
  entry,
  rng,
  report,
}: {
  team: Team;
  entry: Extract<PendingDevelopment, { kind: "advanced-league-advancement" }>;
  rng: Rng;
  report: ManagementReport;
}): void {
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
}

function resolveDraftedOffer(
  team: Team,
  entry: Extract<PendingDevelopment, { kind: "drafted-player-offer" }>,
  report: ManagementReport
): void {
  const player = team.players.find((p) => p.id === entry.playerId)!;

  const keep = draftedPlayerPrice(player) <= team.treasury;
  if (keep) keepDraftedPlayer(team, entry);
  else releaseDraftedPlayer(team, entry);
  report.done.push(
    `${team.name}: drafted ${player.playerName} ${keep ? "kept" : "released"}`
  );
}

function spendSpp(team: Team, rng: Rng, report: ManagementReport): void {
  for (const player of team.players) {
    if (isPendingRecruit(team, player.id)) continue;
    for (let guard = 0; guard < 10 && canAdvance(player); guard++) {
      if (!advanceOnce({ team, player, rng, report })) break;
    }
  }
}

function advanceOnce({
  team,
  player,
  rng,
  report,
}: {
  team: Team;
  player: Player;
  rng: Rng;
  report: ManagementReport;
}): boolean {
  let choice: AdvancementChoice | null = null;
  try {
    choice = advancementChoice(player, nextAdvancementCosts(player)!, rng);
    if (!choice) return false;
    applyAdvancement(player, choice);
    report.done.push(
      `${team.name}: ${player.playerName} took ${describeChoice(choice)}`
    );
    return true;
  } catch (cause) {
    report.refused.push({
      rule: "advancement-refused",
      detail: `${team.name} ${player.playerName}${choice ? ` ${describeChoice(choice)}` : ""}: ${String(cause)}`,
    });
    return false;
  }
}

function describeChoice(choice: AdvancementChoice): string {
  return choice.kind === "characteristic"
    ? `+1 ${choice.stat}`
    : `${choice.kind} ${choice.skill}`;
}

function characteristicAdvancement(
  player: Player,
  rng: Rng
): AdvancementChoice | null {
  const roll = rng.rollDie(8);
  const stats = characteristicChoices(player, roll);
  const [stat] = stats;
  if (stat !== undefined) return { kind: "characteristic", roll, stat };
  const skill = eligibleSkills(player, player.primary ?? [])[0];
  return skill
    ? { kind: "characteristic-fallback", roll, skill, access: "primary" }
    : null;
}

function advancementChoice(
  player: Player,
  costs: NonNullable<ReturnType<typeof nextAdvancementCosts>>,
  rng: Rng
): AdvancementChoice | null {
  const spp = player.spp ?? 0;
  if (spp >= costs.characteristic)
    return characteristicAdvancement(player, rng);
  if (spp >= costs.chosenSecondary && (player.secondary ?? []).length > 0) {
    const skill = eligibleSkills(player, player.secondary ?? [])[0];
    if (skill) return { kind: "chosen-secondary", skill };
  }
  if (spp >= costs.chosenPrimary) {
    const options = eligibleSkills(player, player.primary ?? []);
    if (options.length > 0)
      return {
        kind: "chosen-primary",
        skill: rollFrom(options, rng),
      };
  }
  const category = (player.primary ?? [])[0];
  if (!category) return null;
  const [first] = rollRandomPrimaryCandidates(player, category, rng);
  return { kind: "random-primary", skill: first.skill };
}

function spendTreasury(team: Team, report: ManagementReport): void {
  const spends = isLeagueMode(team.advancementMode) && isActiveTeam(team);
  for (const item of spends ? planPurchases(team) : []) {
    try {
      applyPurchase(team, item);
      report.done.push(`${team.name}: ${describePurchase(item)}`);
    } catch (cause) {
      report.refused.push({
        rule: "purchase-refused",
        detail: `${team.name} ${describePurchase(item)}: ${String(cause)}`,
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
  if (spends && fit < MIN_ROSTER_PLAYERS)
    report.setbacks.push({
      rule: "cannot-refill",
      detail: `${team.name}: ${String(fit)} fit players, ${String(team.treasury)} in the Treasury`,
    });
}

function resolveSkillSelection({
  team,
  entry,
  rng,
  report,
}: {
  team: Team;
  entry: Extract<PendingDevelopment, { kind: "sevens-skill-selection" }>;
  rng: Rng;
  report: ManagementReport;
}): void {
  const draftedAway = (released: { playerName: string }[]) => {
    for (const record of released)
      report.setbacks.push({
        rule: "drafted-away",
        detail: `${team.name}: ${record.playerName}, Treasury ${String(team.treasury)}`,
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
          const option = rollFrom(decision.primaryOptions, rng);
          startPrimarySelection(
            team,
            entry,
            option.playerId,
            firstOf(option.categories)
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
          rollFrom(decision.options, rng)
        );
        break;
      case "roll-primary-d3": {
        const result = rollPrimarySelection(team, entry, rng);
        report.done.push(
          `${team.name}: Skill Selection primary ${result.skill} (D3 ${String(result.d3)})`
        );
        draftedAway(result.draft.released);
        return;
      }
      case "choose-secondary-category":
        rollSecondaryCandidates(team, entry, firstOf(decision.categories), rng);
        break;
      case "choose-secondary-skill": {
        const result = chooseSecondarySkill(
          team,
          entry,
          firstOf(decision.candidates).skill,
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
