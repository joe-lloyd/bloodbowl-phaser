import { shoppingTeamId } from "./pregame";
import { activeMatchFormat } from "../variants/activeMatch";
import { type MatchType } from "../variants/gameTypes";
import {
  Inducement,
  type InducementCatalogEntry,
  type InducementOffer,
  type InducementSelectionLine,
} from "../../types/Inducements";

type Wish = readonly [Inducement, number];

const ALL_ALLOWED = Number.MAX_SAFE_INTEGER;

const SHOPPING_LISTS: Record<MatchType, readonly Wish[]> = {
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
  deathbowl: [],
};

function shoppingList(catalog: readonly InducementCatalogEntry[]) {
  const sevens = SHOPPING_LISTS.sevens;
  const gameType = activeMatchFormat().gameType;
  if (gameType !== "sevens") return SHOPPING_LISTS[gameType];
  const price = (inducement: Inducement) =>
    catalog.find((line) => line.inducement === inducement)?.price ?? Infinity;
  const chefIsBargain =
    price(Inducement.HALFLING_MASTER_CHEF) <
    price(Inducement.EXTRA_TEAM_TRAINING);
  return chefIsBargain
    ? [[Inducement.HALFLING_MASTER_CHEF, ALL_ALLOWED] as const, ...sevens]
    : sevens;
}

export function computerInducementPurchases(
  offer: InducementOffer,
  teamId: string
): InducementSelectionLine[] {
  let remaining = offer.budgets[teamId] ?? 0;
  const purchases: InducementSelectionLine[] = [];
  const catalog = offer.catalogs[teamId] ?? [];
  for (const [inducement, wanted] of shoppingList(catalog)) {
    const entry = catalog.find((line) => line.inducement === inducement);
    if (!entry) continue;
    const quantity = Math.min(
      entry.maxCount,
      wanted,
      Math.floor(remaining / entry.price)
    );
    if (!(quantity > 0)) {
      continue;
    }

    purchases.push({ inducement, quantity });
    remaining -= quantity * entry.price;
  }
  return purchases;
}

export function nextComputerPregameCommand(
  pregame: import("../../types/Inducements").PregameInducementsState,
  teamId: string,
  teamIds: readonly [string, string]
): import("../../headless/protocol").HeadlessCommand | null {
  if (pregame.ready[teamId] !== true) return { type: "ready-weather", teamId };
  const offer = pregame.offer;
  if (!offer || shoppingTeamId(pregame, teamIds) !== teamId) return null;
  const change = nextBasketChange(
    offer.selections[teamId] ?? [],
    computerInducementPurchases(offer, teamId)
  );
  return change
    ? { type: "select-inducement", teamId, ...change }
    : { type: "confirm-inducements", teamId };
}

function nextBasketChange(
  basket: readonly InducementSelectionLine[],
  plan: readonly InducementSelectionLine[]
): InducementSelectionLine | undefined {
  const planned = (inducement: Inducement) =>
    plan.find((line) => line.inducement === inducement)?.quantity ?? 0;
  const held = (inducement: Inducement) =>
    basket.find((line) => line.inducement === inducement)?.quantity ?? 0;
  const surplus = basket.find(
    (line) => line.quantity > planned(line.inducement)
  );
  if (surplus)
    return {
      inducement: surplus.inducement,
      quantity: planned(surplus.inducement),
    };
  return plan.find((line) => held(line.inducement) !== line.quantity);
}
