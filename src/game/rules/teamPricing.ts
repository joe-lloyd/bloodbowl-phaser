/**
 * Team pricing — the single `priceOf(team, item)` service used by Team
 * Builder and Team Management so the price shown to a coach is always the
 * exact price `purchase` charges.
 *
 * Sevens prices are the same at the draft and during a league (docs/
 * SEVENS_RULES.md D4-D7): re-rolls 100,000 up to 6, Assistant Coaches and
 * Cheerleaders 20,000 up to 3 each, one Apothecary at 80,000 when the
 * roster allows it, and Dedicated Fans 20,000 each up to 5. A Matched Play
 * team also buys inducements onto its draft list (MP2), at the draft only.
 *
 * Between league fixtures a team hires players at their roster Hiring Fee
 * (`hirePlayer`). Spike! Journal 22 keeps re-rolls at 100,000 then too,
 * where the core rulebook would charge double: "When drafting a Sevens team
 * roster, or later during the course of a league, Coaches may purchase Team
 * Re-rolls. Each Team Re-roll costs 100,000 gold pieces rather than the
 * cost given on the Team Roster." See openspec/specs/league-treasury.
 */

import { Team, isPendingRecruit } from "../../types/Team";
import { Player, PlayerTemplate, createPlayer } from "../../types/Player";
import { isActiveTeam } from "./teamLifecycle";
import { staysOnRoster } from "./leagueRoster";
import {
  MAX_NON_LINEMEN,
  MAX_ROSTER_PLAYERS,
  isLinemanPosition,
} from "./rosterLegality";
import { freeRosterNumber, uniquePlayerId } from "./playerSlots";
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
      if (isActiveTeam(team)) {
        return {
          amount: null,
          reason: "Inducements go on the draft list only at the draft.",
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

/**
 * The players on the Team Draft List: everyone hired, leaving out a dead
 * league player and anyone still waiting on a hiring decision (a raised
 * Lineman or a Journeyman).
 */
export function draftListPlayers(team: Team): Player[] {
  return team.players.filter(
    (player) =>
      staysOnRoster(team, player) && !isPendingRecruit(team, player.id)
  );
}

/**
 * Why `template` cannot join the Team Draft List now, or undefined when it
 * can. Sevens: "No Blood Bowl Sevens team may ever have more than 11
 * permanently hired players on their Team Draft List." A new hire also
 * needs one of the 11 numbered slots, and a Journeyman or raised Lineman
 * waiting on a hiring decision holds one, so they count against a new hire.
 * Hiring that waiting player counts only the Team Draft List, as the
 * rulebook does. Between fixtures an active team must also respect each
 * position's QTY and the cap of 4 players without the Lineman keyword
 * (D3); a draft list may break those while it is being built, and is
 * checked when it is finalised.
 */
export function hireRefusal(
  team: Team,
  template: PlayerTemplate,
  /** A player already on the team who is being hired for good. */
  joiningPlayerId?: string
): string | undefined {
  const listed = draftListPlayers(team).filter(
    (player) => player.id !== joiningPlayerId
  );
  const limit = Math.min(
    team.maxRosterSize ?? MAX_ROSTER_PLAYERS,
    MAX_ROSTER_PLAYERS
  );
  if (listed.length >= limit) {
    return `A Sevens team may have at most ${limit} permanently hired players.`;
  }
  if (
    joiningPlayerId === undefined &&
    team.players.filter((player) => staysOnRoster(team, player)).length >=
      limit
  ) {
    return `A Sevens team may have at most ${limit} players, counting a Journeyman or recruit still waiting on a hiring decision.`;
  }
  if (!isActiveTeam(team)) return undefined;
  const ofPosition = listed.filter(
    (player) => player.positionName === template.positionName
  ).length;
  if (template.maxAllowed !== undefined && ofPosition >= template.maxAllowed) {
    return `A ${team.rosterName} team may have at most ${template.maxAllowed} ${template.positionName}.`;
  }
  if (
    !isLinemanPosition(template.keywords) &&
    listed.filter((player) => !isLinemanPosition(player.keywords)).length >=
      MAX_NON_LINEMEN
  ) {
    return `A Sevens team may have at most ${MAX_NON_LINEMEN} players without the Lineman keyword.`;
  }
  return undefined;
}

/**
 * Hire a new player from the team's roster, paying their Hiring Fee from
 * the Treasury. Refused, leaving the team unchanged, when the roster has no
 * room for them or the Treasury cannot pay.
 */
export function hirePlayer(
  team: Team,
  template: PlayerTemplate
): PriceResult & { player?: Player } {
  const refusal = hireRefusal(team, template);
  if (refusal) return { amount: null, reason: refusal };
  const price = priceOf(team, { type: "player", cost: template.cost });
  if (price.amount == null) return price;
  if (team.treasury < price.amount) {
    return { amount: null, reason: "Not enough gold in the treasury." };
  }
  // Checked before anything is charged
  const number = freeRosterNumber(team);
  if (number === null) {
    return {
      amount: null,
      reason: "Every roster number from 1 to 11 is taken.",
    };
  }
  const player = createPlayer(template, team.id, number);
  player.id = uniquePlayerId(team, player.id);
  player.cost = price.amount;
  team.players.push(player);
  team.treasury -= price.amount;
  return { ...price, player };
}
