import { HeadlessGame } from "../../src/headless/HeadlessGame";
import {
  Inducement,
  type InducementInventoryEntry,
  buildSeventsInducementProfile,
} from "../../src/types/Inducements";

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

export async function settle(): Promise<void> {
  for (let i = 0; i < 20; i++) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

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
