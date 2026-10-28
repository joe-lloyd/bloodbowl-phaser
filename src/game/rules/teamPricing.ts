/**
 * Team pricing — the single `priceOf(team, item)` service used by Team
 * Builder and Team Management so the price shown to a coach is always the
 * exact price `purchase` charges.
 *
 * Sevens prices are the same at the draft and during a league (docs/
 * SEVENS_RULES.md D4-D7): re-rolls 100,000 up to 6, Assistant Coaches and
 * Cheerleaders 20,000 up to 3 each, one Apothecary at 80,000 when the
 * roster allows it, and Dedicated Fans 20,000 each up to 5. A Matched Play
 * team also buys inducements onto its draft list (MP2).
 */

import { Team } from "../../types/Team";
import { Inducement } from "../../types/Inducements";
import { getRosterByRosterName } from "../../data/RosterTemplates";
import { sevensInducementCatalog } from "../inducements/catalog";
import {
  APOTHECARY_COST,
  ASSISTANT_COACH_COST,
  CHEERLEADER_COST,
  DEDICATED_FAN_COST,
  MAX_ASSISTANT_COACHES,
  MAX_CHEERLEADERS,
  MAX_DEDICATED_FANS,
  MAX_TEAM_REROLLS,
  TEAM_REROLL_COST,
} from "./sevensPrices";

export type StaffItem =
  | { type: "reroll" }
  | { type: "apothecary" }
  | { type: "dedicated-fan" }
  | { type: "coach" }
  | { type: "cheerleader" }
  | { type: "inducement"; inducement: Inducement };

export type PriceableItem = StaffItem | { type: "player"; cost: number };

export interface PriceResult {
  /** Gold amount to display and charge; null when the item is unavailable. */
  amount: number | null;
  /** Present when `amount` is null, naming why the item cannot be bought. */
  reason?: string;
}

function capped(
  count: number,
  max: number,
  amount: number,
  name: string
): PriceResult {
  return count >= max
    ? { amount: null, reason: `A team may have at most ${max} ${name}.` }
    : { amount };
}

/**
 * The amount the UI should display for `item` on `team`, and the exact
 * amount `purchase` will charge. Returns `amount: null` with a reason when
 * the item cannot be bought at all (a limit is reached, or the roster may
 * not hire an Apothecary) rather than a misleading price.
 */
export function priceOf(team: Team, item: PriceableItem): PriceResult {
  switch (item.type) {
    case "reroll":
      return capped(team.rerolls, MAX_TEAM_REROLLS, TEAM_REROLL_COST, "team re-rolls");
    case "dedicated-fan":
      return capped(
        team.dedicatedFans,
        MAX_DEDICATED_FANS,
        DEDICATED_FAN_COST,
        "Dedicated Fans"
      );
    case "apothecary":
      if (!getRosterByRosterName(team.rosterName).apothecary) {
        return {
          amount: null,
          reason: `${team.rosterName} teams cannot hire an Apothecary.`,
        };
      }
      return team.apothecary
        ? { amount: null, reason: "A team may have only one Apothecary." }
        : { amount: APOTHECARY_COST };
    case "coach":
      return capped(
        team.coaches,
        MAX_ASSISTANT_COACHES,
        ASSISTANT_COACH_COST,
        "Assistant Coaches"
      );
    case "cheerleader":
      return capped(team.cheerleaders, MAX_CHEERLEADERS, CHEERLEADER_COST, "Cheerleaders");
    case "inducement": {
      if (team.advancementMode !== "matched-play") {
        return {
          amount: null,
          reason: "Only Matched Play teams buy inducements at the draft.",
        };
      }
      const entry = sevensInducementCatalog(team).find(
        (line) => line.inducement === item.inducement
      );
      if (!entry) {
        return {
          amount: null,
          reason: `${team.rosterName} teams cannot buy ${item.inducement}.`,
        };
      }
      return capped(
        draftInducementCount(team, item.inducement),
        entry.maxCount,
        entry.price,
        item.inducement
      );
    }
    case "player":
      // Eligible hires — draft or active — cost roster price.
      return { amount: item.cost };
  }
}

/**
 * Buy one `item` from the treasury. Returns the amount charged, or
 * `amount: null` with a reason when the purchase is refused, in which case
 * the team is left unchanged.
 */
export function purchase(team: Team, item: StaffItem): PriceResult {
  const price = priceOf(team, item);
  if (price.amount == null) return price;
  if (team.treasury < price.amount) {
    return { amount: null, reason: "Not enough gold in the treasury." };
  }
  team.treasury -= price.amount;
  switch (item.type) {
    case "reroll":
      team.rerolls++;
      break;
    case "dedicated-fan":
      team.dedicatedFans++;
      break;
    case "apothecary":
      team.apothecary = true;
      break;
    case "coach":
      team.coaches++;
      break;
    case "cheerleader":
      team.cheerleaders++;
      break;
    case "inducement": {
      const lines = (team.draftInducements ??= []);
      const line = lines.find((l) => l.inducement === item.inducement);
      if (line) line.quantity++;
      else lines.push({ inducement: item.inducement, quantity: 1 });
      break;
    }
  }
  return price;
}

/** How many of `inducement` a Matched Play team has on its draft list. */
export function draftInducementCount(
  team: Team,
  inducement: Inducement
): number {
  return (
    team.draftInducements?.find((line) => line.inducement === inducement)
      ?.quantity ?? 0
  );
}
