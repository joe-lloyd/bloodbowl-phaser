import { DEFAULT_GAME_TYPE, type GameType } from "./gameTypes";
import { type MatchFormat, matchFormatFor } from "./activeMatch";
import { gameTypeRules } from "./gameTypeRules";
import type { Venue } from "./pitchLayouts";

export interface FormatChoice {
  gameType?: GameType | undefined;
  venue?: Venue | undefined;
}

export function startingFormat(
  { gameType, venue }: FormatChoice,
  random?: () => number
): { format?: MatchFormat } {
  if (gameType === undefined || gameType === DEFAULT_GAME_TYPE) return {};
  if (venue && gameTypeRules(gameType).venues.includes(venue))
    return { format: { gameType, venue } };
  return { format: matchFormatFor(gameType, random) };
}

export function seededRandom(seed: number): () => number {
  return () => (Math.abs(Math.trunc(seed)) % 6) / 6;
}
