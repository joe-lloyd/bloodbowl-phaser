export const GAME_TYPES = [
  "sevens",
  "gutter-bowl",
  "street-bowl",
  "beach-bowl",
] as const;

export type GameType = (typeof GAME_TYPES)[number];

export const EXPERIMENTAL_MATCH_TYPES = ["deathbowl"] as const;

export type MatchType = GameType | (typeof EXPERIMENTAL_MATCH_TYPES)[number];

export const DEFAULT_GAME_TYPE = "sevens" satisfies GameType;

export const GAME_TYPE_LABELS: Record<GameType, string> = {
  sevens: "Sevens",
  "gutter-bowl": "Gutter Bowl",
  "street-bowl": "Street Bowl",
  "beach-bowl": "Beach Bowl",
};

export const GAME_TYPE_SUMMARIES: Record<GameType, string> = {
  sevens:
    "GW 2025 Sevens from Spike! 22: a 20 × 11 stadium pitch with a No Man's Land between two Lines of Scrimmage.",
  "gutter-bowl":
    "GW Gutter Bowl: a full-size walled street or sewer, market stalls or sewer pits, cobbles that hurt, and no referee.",
  "street-bowl":
    "NAF Street Bowl 2024: a 26 × 7 street with walls on both sides, ricochet passes, a double bounce on the cobbles, and no referee.",
  "beach-bowl":
    "NAF Beach Bowl 2025: a 20 × 9 sand pitch, no casualties, a ball that does not bounce, and hard work to Rush.",
};

export function isGameType(value: unknown): value is GameType {
  return GAME_TYPES.some((type) => type === value);
}

export function readGameType(value: unknown): GameType {
  if (value === undefined) return DEFAULT_GAME_TYPE;
  if (isGameType(value)) return value;
  throw new Error("Unknown game type.");
}
