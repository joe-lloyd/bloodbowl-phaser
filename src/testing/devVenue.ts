import type { MatchFormat } from "../game/variants/activeMatch";
import { gameTypeRules } from "../game/variants/gameTypeRules";
import { GAME_TYPES } from "../game/variants/gameTypes";
import { isVenue } from "../game/variants/pitchLayouts";

declare global {
  var __bbDevVenue: string | undefined;
}

export function devVenueFormat():
  Record<string, never> | { format: MatchFormat } {
  if (!import.meta.env.DEV) return {};
  const wanted =
    globalThis.__bbDevVenue ??
    new URLSearchParams(location.search).get("venue");
  if (!isVenue(wanted)) return {};
  const gameType = GAME_TYPES.find((type) =>
    gameTypeRules(type).venues.includes(wanted)
  );
  return gameType ? { format: { gameType, venue: wanted } } : {};
}
