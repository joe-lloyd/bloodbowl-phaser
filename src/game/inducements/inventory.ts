import { type GameState } from "../../types/GameState";
import {
  Inducement,
  type InducementInventoryEntry,
  emptyInducementsState,
} from "../../types/Inducements";

function purchasedInducements(
  state: GameState,
  teamId: string
): InducementInventoryEntry[] {
  return (state.inducements?.inventory ?? []).filter(
    (entry) => entry.ownerTeamId === teamId
  );
}

export function inducementCount(
  state: GameState,
  teamId: string,
  inducement: Inducement
): number {
  return purchasedInducements(state, teamId)
    .filter((entry) => entry.inducement === inducement)
    .reduce((sum, entry) => sum + entry.quantity, 0);
}

export function inducementUsesLeft(
  state: GameState,
  teamId: string,
  inducement: Inducement
): number {
  return purchasedInducements(state, teamId)
    .filter((entry) => entry.inducement === inducement)
    .reduce((sum, entry) => sum + entry.remainingUses, 0);
}

export function spendInducement(
  state: GameState,
  teamId: string,
  inducement: Inducement
): boolean {
  const entry = purchasedInducements(state, teamId).find(
    (candidate) =>
      candidate.inducement === inducement && candidate.remainingUses > 0
  );
  if (!entry) return false;
  entry.remainingUses--;
  return true;
}

export type PotionInducement =
  | typeof Inducement.MAGIC_POTION
  | typeof Inducement.LESSER_MAGIC_POTION
  | typeof Inducement.SUPERIOR_MAGIC_POTION;

export function grantFreePotion(
  state: GameState,
  teamId: string,
  kind: PotionInducement
): void {
  state.inducements ??= emptyInducementsState();
  state.inducements.inventory.push({
    inducement: kind,
    ownerTeamId: teamId,
    quantity: 1,
    remainingUses: 1,
    price: 0,
    provenance: "free",
  });
}

export function koRecoveryBonus(state: GameState, teamId: string): number {
  return (
    inducementCount(state, teamId, Inducement.BLITZERS_BEST_KEGS) +
    inducementCount(state, teamId, Inducement.SNACK_STAND)
  );
}
