import { shoppingTeamId } from "./pregame";
import { activeMatchFormat } from "../variants/activeMatch";
import { type GameType } from "../variants/gameTypes";
import {
  Inducement,
  type InducementOffer,
  type InducementSelectionLine,
} from "../../types/Inducements";

type Wish = readonly [Inducement, number];

const ALL_ALLOWED = Number.MAX_SAFE_INTEGER;

const SHOPPING_LISTS: Record<GameType, readonly Wish[]> = {
  sevens: [
    [Inducement.EXTRA_TEAM_TRAINING, ALL_ALLOWED],
    [Inducement.BLITZERS_BEST_KEGS, ALL_ALLOWED],
    [Inducement.PART_TIME_ASSISTANT_COACH, ALL_ALLOWED],
    [Inducement.TEMP_AGENCY_CHEERLEADER, ALL_ALLOWED],
  ],
  "street-bowl": [
    [Inducement.HALFLING_MASTER_CHEF, 1],
    [Inducement.MAGIC_POTION, 3],
  ],
  "beach-bowl": [
    [Inducement.BLITZERS_BEST_KEGS, 2],
    [Inducement.HALFLING_MASTER_CHEF, 1],
    [Inducement.SOUVENIR, 3],
  ],
  "gutter-bowl": [
    [Inducement.SUPERIOR_MAGIC_POTION, 2],
    [Inducement.SNACK_STAND, 1],
    [Inducement.SAWBONES, 1],
    [Inducement.NOVICE_WIZARD, 1],
    [Inducement.LESSER_MAGIC_POTION, 3],
  ],
};

function computerInducementPurchases(
  offer: InducementOffer,
  teamId: string
): InducementSelectionLine[] {
  let remaining = offer.budgets[teamId] ?? 0;
  const purchases: InducementSelectionLine[] = [];
  for (const [inducement, wanted] of SHOPPING_LISTS[
    activeMatchFormat().gameType
  ]) {
    const entry = offer.catalogs[teamId]?.find(
      (line) => line.inducement === inducement
    );
    if (!entry) continue;
    const quantity = Math.min(
      entry.maxCount,
      wanted,
      Math.floor(remaining / entry.price)
    );
    if (quantity > 0) {
      purchases.push({ inducement, quantity });
      remaining -= quantity * entry.price;
    }
  }
  return purchases;
}

export function nextComputerPregameCommand(
  pregame: import("../../types/Inducements").PregameInducementsState,
  teamId: string,
  teamIds: readonly [string, string]
): import("../../headless/protocol").HeadlessCommand | null {
  if (!pregame.ready[teamId]) return { type: "ready-weather", teamId };
  const offer = pregame.offer;
  if (!offer || shoppingTeamId(pregame, teamIds) !== teamId) return null;
  for (const line of computerInducementPurchases(offer, teamId)) {
    const quantity =
      offer.selections[teamId]?.find(
        (item) => item.inducement === line.inducement
      )?.quantity ?? 0;
    if (quantity !== line.quantity)
      return { type: "select-inducement", teamId, ...line };
  }
  return { type: "confirm-inducements", teamId };
}
