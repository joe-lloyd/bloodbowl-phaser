import { getRosterByRosterName } from "../../data/RosterTemplates";
import {
  addedSkillCount,
  draftedPlayerPrice,
} from "../progression/advancementModes";
import {
  InjuryType,
  type Player,
  type PlayerTemplate,
} from "../../types/Player";
import { type Team, isLeagueMode } from "../../types/Team";
import { EXPENSIVE_MISTAKES_THRESHOLD } from "./expensiveMistakes";
import {
  type JourneymanOffer,
  hireJourneyman,
  journeymanHireRefusal,
  journeymanPrice,
  releaseJourneyman,
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

type PurchaseReason =
  | "minimum"
  | "journeyman"
  | "reroll"
  | "roster"
  | "spend-down";

type PlannedStaff = "reroll" | "apothecary" | "coach" | "cheerleader";

export type PlannedPurchase =
  | {
      kind: "journeyman";

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
    }
  | {
      kind: "release-journeyman";
      offerId: string;
      playerId: string;
      playerName: string;
      price: number;
      reason: PurchaseReason;
    };

type UnpricedPurchase = PlannedPurchase extends infer Item
  ? Item extends PlannedPurchase
    ? Omit<Item, "price">
    : never
  : never;

const SPEND_DOWN: readonly PlannedStaff[] = [
  "apothecary",
  "reroll",
  "coach",
  "cheerleader",
];

const MAX_PURCHASES = 40;

export function fitPlayers(team: Team): Player[] {
  return draftListPlayers(team).filter((player) => isFit(team, player));
}

export function draftReserve(team: Team): number {
  if (team.advancementMode !== "sevens-skill-selection") return 0;
  return Math.max(
    0,
    ...draftListPlayers(team)
      .filter((player) => addedSkillCount(player) >= 1)
      .map(draftedPlayerPrice)
  );
}

export function journeymanOffers(team: Team): JourneymanOffer[] {
  return (team.pendingDevelopment ?? []).filter(
    (entry): entry is JourneymanOffer => entry.kind === "journeyman-offer"
  );
}

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
    case "release-journeyman": {
      const offer = journeymanOffers(team).find(
        (entry) => entry.id === item.offerId
      );
      if (!offer) throw new Error("This Journeyman offer has been answered.");
      releaseJourneyman(team, offer);
      return 0;
    }
  }
}

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

  const spare = () => sim.treasury - draftReserve(sim);
  const hireJourneymanFor = (reason: PurchaseReason, budget: () => number) => {
    for (const offer of journeymanOffers(sim)) {
      const player = sim.players.find((p) => p.id === offer.playerId);
      if (
        !player ||
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

  const swapJourneymenForPlayer = () => {
    const offers = journeymanOffers(sim);
    const refused = offers.filter(
      (entry) => journeymanHireRefusal(sim, entry) !== undefined
    );
    const unfit = offers.filter((entry) => {
      const player = sim.players.find((p) => p.id === entry.playerId);
      return !refused.includes(entry) && !!player && !isFit(sim, player);
    });
    const candidates = [...refused, ...unfit].map(
      (offer): UnpricedPurchase => ({
        kind: "release-journeyman",
        offerId: offer.id,
        playerId: offer.playerId,
        playerName:
          sim.players.find((p) => p.id === offer.playerId)?.playerName ??
          offer.playerId,
        reason: "minimum",
      })
    );
    for (let size = 1; size <= candidates.length; size++) {
      for (const releases of combinations(candidates, size)) {
        const trial = structuredClone(sim);
        let hire: UnpricedPurchase | undefined;
        try {
          for (const release of releases)
            applyPurchase(trial, { ...release, price: 0 });
          const template = cheapestHire(trial, trial.treasury);
          if (!template) continue;
          hire = {
            kind: "player",
            positionName: template.positionName,
            reason: "minimum",
          };
          applyPurchase(trial, { ...hire, price: 0 });
        } catch {
          continue;
        }
        return releases.every((release) => buy(release)) && buy(hire);
      }
    }
    return false;
  };

  while (fitPlayers(sim).length < MIN_ROSTER_PLAYERS) {
    if (
      !hireJourneymanFor("minimum", () => sim.treasury) &&
      !hireCheapest("minimum", sim.treasury) &&
      !swapJourneymenForPlayer()
    )
      break;
  }

  while (hireJourneymanFor("journeyman", spare));

  const reroll = priceOf(sim, { type: "reroll" }).amount;
  if (sim.rerolls === 0 && reroll != null && reroll <= spare())
    buy({ kind: "staff", item: "reroll", reason: "reroll" });

  while (hireCheapest("roster", spare()));

  while (sim.treasury >= EXPENSIVE_MISTAKES_THRESHOLD) {
    const item = SPEND_DOWN.find((candidate) => {
      const price = priceOf(sim, { type: candidate }).amount;
      return price != null && price <= spare();
    });
    if (!item || !buy({ kind: "staff", item, reason: "spend-down" })) break;
  }
  return plan;
}

export function describePurchase(item: PlannedPurchase): string {
  if (item.kind === "release-journeyman")
    return `let Journeyman ${item.playerName} go to free a roster slot`;
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

function combinations<T>(items: readonly T[], size: number): T[][] {
  if (size === 0) return [[]];
  return items.flatMap((item, index) =>
    combinations(items.slice(index + 1), size - 1).map((rest) => [
      item,
      ...rest,
    ])
  );
}

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

function cheapestHire(team: Team, budget: number): PlayerTemplate | undefined {
  return rosterTemplates(team)
    .map((template, index) => ({ template, index }))
    .filter(({ template }) => {
      const price = priceOf(team, { type: "player", cost: template.cost });
      if (price.amount == null || price.amount > budget) return false;

      return hireRefusal(team, template) === undefined;
    })
    .sort((a, b) => a.template.cost - b.template.cost || a.index - b.index)[0]
    ?.template;
}
