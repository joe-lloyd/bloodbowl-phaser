import { DEFAULT_GAME_TYPE, type GameType } from "./gameTypes";
import { type MatchFormat, matchFormatFor } from "./activeMatch";

export function startingFormat(
  gameType: GameType | undefined,
  random?: () => number
): { format?: MatchFormat } {
  if (gameType === undefined || gameType === DEFAULT_GAME_TYPE) return {};
  return { format: matchFormatFor(gameType, random) };
}

export function seededRandom(seed: number): () => number {
  return () => (Math.abs(Math.trunc(seed)) % 6) / 6;
}
