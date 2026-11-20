import type { MatchFormat } from "../game/variants/activeMatch";
import { gameTypeRules } from "../game/variants/gameTypeRules";
import { GAME_TYPES } from "../game/variants/gameTypes";
import { isVenue } from "../game/variants/pitchLayouts";

declare global {
  interface Window {
    __bbDevVenue?: string;
  }
}

export function devVenueFormat():
  | { format: MatchFormat }
  | Record<string, never> {
  if (!import.meta.env.DEV) return {};
  const wanted =
    window.__bbDevVenue ??
    new URLSearchParams(window.location.search).get("venue");
  if (!isVenue(wanted)) return {};
  const gameType = GAME_TYPES.find((type) =>
    gameTypeRules(type).venues.includes(wanted)
  );
  return gameType ? { format: { gameType, venue: wanted } } : {};
}
