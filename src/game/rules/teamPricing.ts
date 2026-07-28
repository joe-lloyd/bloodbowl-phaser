/**
 * Team pricing — the single `priceOf(team, item)` service used by Team
 * Builder and Team Management so the price shown to a coach is always the
 * exact price the matching purchase command charges.
 *
 * Draft teams pay roster price for everything, except re-rolls which cost
 * double roster price at draft time. Active teams cannot purchase re-rolls
 * or Dedicated Fans at all (see teamLifecycle.ts / teamEditLegality.ts). A
 * legal active-team player hire is still roster price — only re-rolls and
 * Dedicated Fans stop — subject to the usual roster/budget limits enforced
 * elsewhere.
 */

import { Team } from "../../types/Team";
import { isActiveTeam } from "./teamLifecycle";

export const DEDICATED_FAN_COST = 10_000;
export const APOTHECARY_COST = 50_000;
export const ASSISTANT_COACH_COST = 10_000;
export const CHEERLEADER_COST = 10_000;

export type PriceableItem =
  | { type: "reroll" }
  | { type: "apothecary" }
  | { type: "dedicated-fan" }
  | { type: "coach" }
  | { type: "cheerleader" }
  | { type: "player"; cost: number };

export interface PriceResult {
  /** Gold amount to display and charge; null when the item is unavailable. */
  amount: number | null;
  /** Present when `amount` is null, naming why the item cannot be bought. */
  reason?: string;
}

/**
 * The amount the UI should display for `item` on `team`, and the exact
 * amount the matching purchase command will charge. Returns `amount: null`
 * with a reason when the item cannot be purchased at all (e.g. Dedicated
 * Fans on an active team) rather than a misleading price.
 */
export function priceOf(team: Team, item: PriceableItem): PriceResult {
  const active = isActiveTeam(team);

  switch (item.type) {
    case "reroll": {
      if (active) {
        return {
          amount: null,
          reason: "Active teams cannot purchase re-rolls.",
        };
      }
      const rosterCost = rerollRosterCost(team);
      return { amount: rosterCost * 2 };
    }
    case "dedicated-fan":
      if (active) {
        return {
          amount: null,
          reason: "Active teams cannot purchase Dedicated Fans.",
        };
      }
      return { amount: DEDICATED_FAN_COST };
    case "apothecary":
      return { amount: APOTHECARY_COST };
    case "coach":
      return { amount: ASSISTANT_COACH_COST };
    case "cheerleader":
      return { amount: CHEERLEADER_COST };
    case "player":
      // Eligible hires — draft or active — cost roster price.
      return { amount: item.cost };
  }
}

function rerollRosterCost(team: Team): number {
  return team.rerollCost;
}
