import {
  GAME_TYPE_LABELS,
  type MatchType,
} from "../../src/game/variants/gameTypes";
import type { Layer } from "../boundary/schemas";

export const MATCH_TYPE_LABELS: Record<MatchType, string> = {
  ...GAME_TYPE_LABELS,
  deathbowl: "Deathbowl",
};

export function layerLabel(layer: Layer): string {
  switch (layer.kind) {
    case "all":
      return "Every team";
    case "gameType":
      return MATCH_TYPE_LABELS[layer.gameType];
    case "roster":
      return layer.roster;
  }
}

export const formatNumber = (value: number) =>
  String(Number.isSafeInteger(value) ? value : Number(value.toFixed(3)));

export function matches(query: string, ...texts: string[]): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const haystack = texts.join(" ").toLowerCase();
  return words.every((word) => haystack.includes(word));
}
