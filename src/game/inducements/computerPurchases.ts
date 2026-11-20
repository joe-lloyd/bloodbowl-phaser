import { shoppingTeamId } from "./pregame";
import {
  Inducement,
  type InducementCatalogEntry,
  type InducementOffer,
  type InducementSelectionLine,
} from "../../types/Inducements";

const SHOPPING_LIST = [
  Inducement.EXTRA_TEAM_TRAINING,
  Inducement.BLITZERS_BEST_KEGS,
  Inducement.PART_TIME_ASSISTANT_COACH,
  Inducement.TEMP_AGENCY_CHEERLEADER,
];

function shoppingList(catalog: readonly InducementCatalogEntry[]) {
  const price = (inducement: Inducement) =>
    catalog.find((line) => line.inducement === inducement)?.price ?? Infinity;
  const chefIsBargain =
    price(Inducement.HALFLING_MASTER_CHEF) <
    price(Inducement.EXTRA_TEAM_TRAINING);
  return chefIsBargain
    ? [Inducement.HALFLING_MASTER_CHEF, ...SHOPPING_LIST]
    : SHOPPING_LIST;
}

function computerInducementPurchases(
  offer: InducementOffer,
  teamId: string
): InducementSelectionLine[] {
  let remaining = offer.budgets[teamId] ?? 0;
  const purchases: InducementSelectionLine[] = [];
  const catalog = offer.catalogs[teamId] ?? [];
  for (const inducement of shoppingList(catalog)) {
    const entry = catalog.find((line) => line.inducement === inducement);
    if (!entry) continue;
    const quantity = Math.min(
      entry.maxCount,
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
