/**
 * What a team nobody is coaching buys with its Treasury between fixtures.
 * The spec is openspec/specs/league-treasury/spec.md ("A team with no
 * human coach spends its own Treasury").
 *
 * `planPurchases` is pure: it tries each purchase on a copy of the team
 * through `applyPurchase`, which is the code a coach's own purchase runs
 * (`hirePlayer` and `purchase` in teamPricing.ts, `hireJourneyman` in
 * journeymen.ts). So a plan is only ever what a coach could buy: the same
 * prices, the same roster limits, and a Treasury that never goes below
 * zero. It needs no dice, so the same team always gets the same plan.
 *
 * Priorities, in order:
 * 1. Up to the 7 fit players a team needs to take the field: first a fit
 *    Journeyman who played, who costs a Lineman's Hiring Fee plus any Value
 *    Increase they bring with them, so the team does not pay for a new
 *    Lineman and then for the Journeyman too; then the cheapest player the
 *    roster allows.
 * 2. Every other Journeyman who played, while there is room and gold.
 * 3. A team re-roll, when the team has none.
 * 4. The cheapest players the roster allows, toward its limit of 11.
 * 5. While the Treasury still holds the 100,000 gp Expensive Mistakes
 *    rolls on: an Apothecary, then more re-rolls, then Assistant Coaches
 *    and Cheerleaders.
 * Anything left is kept. Steps 2 to 5 never spend a Sevens Skill Selection
 * team's draft reserve (`draftReserve`).
 */

import { getRosterByRosterName } from "../../data/RosterTemplates";
import {
  addedSkillCount,
  draftedPlayerPrice,
} from "../progression/advancementModes";
import { InjuryType, Player, PlayerTemplate } from "../../types/Player";
import { SkillType, hasSkill } from "../../types/Skills";
import { Team, isLeagueMode } from "../../types/Team";
import { EXPENSIVE_MISTAKES_THRESHOLD } from "./expensiveMistakes";
import { countInsignificant } from "./insignificant";
import {
  JourneymanOffer,
  hireJourneyman,
  journeymanHireRefusal,
  journeymanPrice,
} from "./journeymen";
import { MIN_ROSTER_PLAYERS } from "./rosterLegality";
import { canEdit } from "./teamEditLegality";
import {
  draftListPlayers,
  hirePlayer,
  hireRefusal,
  priceOf,
  purchase,
} from "./teamPricing";

/** Why a purchase is in the plan: the priority that chose it. */
export type PurchaseReason =
  | "minimum"
  | "journeyman"
  | "reroll"
  | "roster"
  | "spend-down";

/** The Sideline Staff and re-rolls a plan may buy. */
export type PlannedStaff = "reroll" | "apothecary" | "coach" | "cheerleader";

export type PlannedPurchase =
  | {
      kind: "journeyman";
      /** The `journeyman-offer` answered by hiring. */
      offerId: string;
      playerId: string;
      playerName: string;
      price: number;
      reason: PurchaseReason;
    }
  | {
      kind: "player";
      positionName: string;
      price: number;
      reason: PurchaseReason;
    }
  | {
      kind: "staff";
      item: PlannedStaff;
      price: number;
      reason: PurchaseReason;
    };

/** A purchase before it is priced: the planner prices it by making it. */
type UnpricedPurchase = PlannedPurchase extends infer Item
  ? Item extends PlannedPurchase
    ? Omit<Item, "price">
    : never
  : never;

/** Bought while the Treasury could still lose gold to Expensive Mistakes. */
const SPEND_DOWN: readonly PlannedStaff[] = [
  "apothecary",
  "reroll",
  "coach",
  "cheerleader",
];

/** More purchases than any Sevens team can make between two fixtures. */
const MAX_PURCHASES = 40;

/**
 * Players on the Team Draft List who can play the next game: in a league
 * a Miss Next Game or Dead result keeps a player out.
 */
export function fitPlayers(team: Team): Player[] {
  return draftListPlayers(team).filter((player) => isFit(team, player));
}

/**
 * Gold a Sevens Skill Selection team keeps back after it can field 7. After
 * a game a pro team may draft any player with an added skill, and the team
 * keeps them only by paying their value from the Treasury, or loses them
 * (Drafted Players, advancementModes.ts). So the extras wait until the team
 * could pay to keep its most valuable skilled player. Other teams keep
 * nothing back.
 */
export function draftReserve(team: Team): number {
  if (team.advancementMode !== "sevens-skill-selection") return 0;
  return Math.max(
    0,
    ...draftListPlayers(team)
      .filter((player) => addedSkillCount(player) >= 1)
      .map(draftedPlayerPrice)
  );
}

/** The Journeymen still waiting on a hiring decision, oldest offer first. */
export function journeymanOffers(team: Team): JourneymanOffer[] {
  return (team.pendingDevelopment ?? []).filter(
    (entry): entry is JourneymanOffer => entry.kind === "journeyman-offer"
  );
}

/**
 * Make one planned purchase on `team` through the code a coach's purchase
 * runs. Returns the gold charged; throws with the reason when the rules
 * refuse it, leaving the team unchanged.
 */
export function applyPurchase(team: Team, item: PlannedPurchase): number {
  switch (item.kind) {
    case "journeyman": {
      const offer = journeymanOffers(team).find(
        (entry) => entry.id === item.offerId
      );
      if (!offer) throw new Error("This Journeyman offer has been answered.");
      return hireJourneyman(team, offer);
    }
    case "player": {
      const decision = canEdit(team, { type: "hire-player" });
      if (!decision.allowed) throw new Error(decision.reason);
      const template = rosterTemplates(team).find(
        (candidate) => candidate.positionName === item.positionName
      );
      if (!template)
        throw new Error(`${item.positionName} is not on the roster.`);
      const hired = hirePlayer(team, template);
      if (hired.amount == null) throw new Error(hired.reason);
      return hired.amount;
    }
    case "staff": {
      const bought = purchase(team, { type: item.item });
      if (bought.amount == null) throw new Error(bought.reason);
      return bought.amount;
    }
  }
}

/**
 * The purchases a team with no human coach makes from its Treasury, in
 * order. Pure: `team` is not changed, and the same team gives the same
 * plan. Apply it with `applyPurchase`, one purchase at a time.
 */
export function planPurchases(team: Team): PlannedPurchase[] {
  const sim = structuredClone(team);
  const plan: PlannedPurchase[] = [];
  const buy = (item: UnpricedPurchase): boolean => {
    if (plan.length >= MAX_PURCHASES) return false;
    try {
      const price = applyPurchase(sim, { ...item, price: 0 });
      plan.push({ ...item, price });
      return true;
    } catch {
      return false;
    }
  };
  /** Gold steps 2 to 5 may spend. */
  const spare = () => sim.treasury - draftReserve(sim);
  const hireJourneymanFor = (reason: PurchaseReason, budget: () => number) => {
    for (const offer of journeymanOffers(sim)) {
      const player = sim.players.find((p) => p.id === offer.playerId);
      if (
        !player ||
        // Only a Journeyman who can play gets a short team to 7
        (reason === "minimum" && !isFit(sim, player)) ||
        journeymanPrice(player) > budget() ||
        journeymanHireRefusal(sim, offer) !== undefined
      )
        continue;
      return buy({
        kind: "journeyman",
        offerId: offer.id,
        playerId: player.id,
        playerName: player.playerName,
        reason,
      });
    }
    return false;
  };
  const hireCheapest = (reason: PurchaseReason, budget: number) => {
    const template = cheapestHire(sim, budget);
    return (
      !!template &&
      buy({ kind: "player", positionName: template.positionName, reason })
    );
  };

  // 1. Enough fit players to take the field
  while (fitPlayers(sim).length < MIN_ROSTER_PLAYERS) {
    if (
      !hireJourneymanFor("minimum", () => sim.treasury) &&
      !hireCheapest("minimum", sim.treasury)
    )
      break;
  }
  // 2. Every Journeyman who played, while there is room and gold
  while (hireJourneymanFor("journeyman", spare));
  // 3. A team re-roll, when it has none
  const reroll = priceOf(sim, { type: "reroll" }).amount;
  if (sim.rerolls === 0 && reroll != null && reroll <= spare())
    buy({ kind: "staff", item: "reroll", reason: "reroll" });
  // 4. The roster toward its limit
  while (hireCheapest("roster", spare()));
  // 5. Nothing left sitting where Expensive Mistakes can take it
  while (sim.treasury >= EXPENSIVE_MISTAKES_THRESHOLD) {
    const item = SPEND_DOWN.find((candidate) => {
      const price = priceOf(sim, { type: candidate }).amount;
      return price != null && price <= spare();
    });
    if (!item || !buy({ kind: "staff", item, reason: "spend-down" })) break;
  }
  return plan;
}

/** A plan's purchase in words, for the computer's report. */
export function describePurchase(item: PlannedPurchase): string {
  const what =
    item.kind === "journeyman"
      ? `hired Journeyman ${item.playerName}`
      : item.kind === "player"
        ? `hired a ${item.positionName}`
        : `bought ${STAFF_NAMES[item.item]}`;
  return `${what} for ${item.price.toLocaleString("en-GB")} gp`;
}

const STAFF_NAMES: Record<PlannedStaff, string> = {
  reroll: "a team re-roll",
  apothecary: "an Apothecary",
  coach: "an Assistant Coach",
  cheerleader: "a Cheerleader",
};

function isFit(team: Team, player: Player): boolean {
  return !(
    isLeagueMode(team.advancementMode) &&
    (player.injuries.includes(InjuryType.MISS_NEXT_GAME) ||
      player.injuries.includes(InjuryType.DEAD))
  );
}

function rosterTemplates(team: Team): PlayerTemplate[] {
  return getRosterByRosterName(team.rosterName).playerTemplates;
}

/**
 * The cheapest player the roster lets this team hire now for at most
 * `budget`, or undefined. The roster's own order breaks a tie. A player
 * with Insignificant is left out when they would outnumber the rest.
 */
function cheapestHire(team: Team, budget: number): PlayerTemplate | undefined {
  const listed = draftListPlayers(team);
  const insignificant = countInsignificant(listed);
  // Insignificant: "you may not include more players with this Trait than
  // players without this Trait" (insignificant.ts)
  const roomForInsignificant =
    insignificant + 1 <= listed.length - insignificant;
  return rosterTemplates(team)
    .map((template, index) => ({ template, index }))
    .filter(({ template }) => {
      const price = priceOf(team, { type: "player", cost: template.cost });
      if (price.amount == null || price.amount > budget) return false;
      if (hireRefusal(team, template) !== undefined) return false;
      return (
        roomForInsignificant ||
        !hasSkill(template.skills, SkillType.INSIGNIFICANT)
      );
    })
    .sort((a, b) => a.template.cost - b.template.cost || a.index - b.index)[0]
    ?.template;
}
