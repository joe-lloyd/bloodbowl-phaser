/**
 * Reading and spending a match's inducement inventory. Every effect asks
 * here how many of an inducement a team has, so the inventory on
 * `GameState.inducements` stays the single source.
 */

import { GameState } from "../../types/GameState";
import {
  Inducement,
  InducementInventoryEntry,
} from "../../types/Inducements";

/** Every inducement line this team holds in this match. */
export function purchasedInducements(
  state: GameState,
  teamId: string
): InducementInventoryEntry[] {
  return (state.inducements?.inventory ?? []).filter(
    (entry) => entry.ownerTeamId === teamId
  );
}

/** How many of `inducement` the team holds, used or not. */
export function inducementCount(
  state: GameState,
  teamId: string,
  inducement: Inducement
): number {
  return purchasedInducements(state, teamId)
    .filter((entry) => entry.inducement === inducement)
    .reduce((sum, entry) => sum + entry.quantity, 0);
}

/** How many uses of `inducement` the team has left this match. */
export function inducementUsesLeft(
  state: GameState,
  teamId: string,
  inducement: Inducement
): number {
  return purchasedInducements(state, teamId)
    .filter((entry) => entry.inducement === inducement)
    .reduce((sum, entry) => sum + entry.remainingUses, 0);
}

/** Spend one use of `inducement`; false when none are left. */
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
