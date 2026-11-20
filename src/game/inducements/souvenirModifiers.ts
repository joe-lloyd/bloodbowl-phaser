import { type GameState } from "@/types/GameState";
import { type Souvenir } from "./variantState";

export type SouvenirRoll =
  | "rush"
  | "dodge"
  | "pick-up"
  | "catch"
  | "intercept"
  | "pass";

const ROLL_BONUS: Record<Souvenir, Partial<Record<SouvenirRoll, number>>> = {
  "Sports Sandals": { rush: 1 },
  "Suntan Lotion": { dodge: 1 },
  Thong: {},
  Sunglasses: {},
  Bottle: {},
  "Puka Shell Necklace": {},
  "Sticky Bun": { "pick-up": 1, catch: 1, intercept: 1, pass: -1 },
  Gatorcade: {},
};

export function souvenirModifier(
  state: GameState,
  playerId: string,
  roll: SouvenirRoll
): number {
  return (state.matchInducements?.variant?.souvenirs ?? [])
    .filter((held) => held.playerId === playerId)
    .reduce((sum, held) => sum + (ROLL_BONUS[held.souvenir][roll] ?? 0), 0);
}
