import { HeadlessGame } from "../../src/headless/HeadlessGame";
import {
  Inducement,
  InducementInventoryEntry,
  buildSeventsInducementProfile,
} from "../../src/types/Inducements";

/** One purchased inventory line, as a confirmed pregame selection makes. */
export function bought(
  ownerTeamId: string,
  inducement: Inducement,
  quantity: number
): InducementInventoryEntry {
  return {
    inducement,
    ownerTeamId,
    quantity,
    remainingUses: quantity,
    price: 0,
    provenance: "purchased",
    duration: "match",
  };
}

/** Let queued engine operations run up to their first decision. */
export async function settle(): Promise<void> {
  for (let i = 0; i < 20; i++) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

/**
 * Commit an inducement inventory, as both coaches confirming would, and let
 * the Prayers and Desperate Measures roll.
 */
export async function commit(
  game: HeadlessGame,
  inventory: InducementInventoryEntry[]
): Promise<void> {
  game.ctx.gameService.commitInducements(
    buildSeventsInducementProfile({ advancedLeague: false }),
    {},
    inventory
  );
  await settle();
}
