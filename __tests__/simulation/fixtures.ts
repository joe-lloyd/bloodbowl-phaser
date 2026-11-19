import { fixtureValue } from "../../src/testing/fixtureValue";
import { onField, type FieldPlayer } from "../../src/simulation/ai/board";
import type { Player } from "../../src/types/Player";

export function fieldPlayer(value: Player | undefined): FieldPlayer {
  const player = fixtureValue(value);
  if (!onField(player)) throw new Error("Expected a player on the pitch");
  return player;
}
