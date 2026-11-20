import type { GameType } from "./gameTypes";
import type { Venue } from "./pitchLayouts";

export type KickoffTableId =
  | "sevens"
  | "street-bowl"
  | "beach-bowl"
  | "gutter-street"
  | "gutter-sewer";

export type WeatherTableId = KickoffTableId;

export type InjuryTableId = "sevens" | "beach-bowl" | "standard";

export type RerollPricing =
  | { kind: "flat"; cost: number }
  | { kind: "double-roster" };

export interface DraftRules {
  budget: number;
  minPlayers: number;
  maxPlayers: number;
  maxNonLinemen: number;
  rerolls: RerollPricing;
  assistantCoaches: boolean;
  cheerleaders: boolean;
  apothecary: boolean;
  dedicatedFanCostMultiplier: number;
  veteran: boolean;
}

export interface SetupRules {
  maxOnPitch: number;
  minOnLineOfScrimmage: number;
  maxPerWideZone: number;
}

export type FoulRetribution = "none" | "rock" | "sand";

export interface ArmourRules {
  knockedDownOrFallsOver: number;
  wallPush: number;
  failedDodgeOrRush: number | null;
  foul: number;
}

type SecretWeaponsAfterDrive =
  | "referee"
  | "one-drive"
  | "street-crowd"
  | "gutter-crowd";

export type StallingPenalty = "crowd" | "bottle";

export interface GameTypeRules {
  gameType: GameType;
  venues: readonly [Venue, ...Venue[]];
  turnsPerHalf: number;
  draft: DraftRules;
  setup: SetupRules;
  kickoffTable: (venue: Venue) => KickoffTableId;
  weatherTable: (venue: Venue) => WeatherTableId;
  injuryTable: InjuryTableId;
  kickDeviation: "lower-of-2d6" | "d6";
  throwInDistance: "d6+2" | "2d6" | "d6";
  ballBounces: 0 | 1 | 2;
  armour: ArmourRules;
  referee: boolean;
  foulRetribution: FoulRetribution;
  rushTarget: number;
  secretWeaponsAfterDrive: SecretWeaponsAfterDrive;
  stallingPenalty: StallingPenalty;
}

const SEVENS_DRAFT: DraftRules = {
  budget: 600_000,
  minPlayers: 7,
  maxPlayers: 11,
  maxNonLinemen: 4,
  rerolls: { kind: "flat", cost: 100_000 },
  assistantCoaches: true,
  cheerleaders: true,
  apothecary: true,
  dedicatedFanCostMultiplier: 1,
  veteran: true,
};

const NO_ARMOUR_CHANGE: ArmourRules = {
  knockedDownOrFallsOver: 0,
  wallPush: 0,
  failedDodgeOrRush: null,
  foul: 0,
};

const COBBLES: ArmourRules = {
  knockedDownOrFallsOver: 1,
  wallPush: 1,
  failedDodgeOrRush: null,
  foul: 0,
};

const SEVENS = "sevens";
const STREET_BOWL = "street-bowl";
const BEACH_BOWL = "beach-bowl";

const venueTable = (venue: Venue): KickoffTableId =>
  venue === "gutter-sewer" ? venue : "gutter-street";

export const GAME_TYPE_RULES: Record<GameType, GameTypeRules> = {
  [SEVENS]: {
    gameType: SEVENS,
    venues: ["stadium"],
    turnsPerHalf: 6,
    draft: SEVENS_DRAFT,
    setup: { maxOnPitch: 7, minOnLineOfScrimmage: 3, maxPerWideZone: 1 },
    kickoffTable: () => SEVENS,
    weatherTable: () => SEVENS,
    injuryTable: SEVENS,
    kickDeviation: "lower-of-2d6",
    throwInDistance: "d6+2",
    ballBounces: 1,
    armour: NO_ARMOUR_CHANGE,
    referee: true,
    foulRetribution: "none",
    rushTarget: 2,
    secretWeaponsAfterDrive: "referee",
    stallingPenalty: "crowd",
  },
  [STREET_BOWL]: {
    gameType: STREET_BOWL,
    venues: ["street"],
    turnsPerHalf: 6,
    draft: {
      ...SEVENS_DRAFT,
      rerolls: { kind: "double-roster" },
      assistantCoaches: false,
      cheerleaders: false,
      apothecary: false,
      dedicatedFanCostMultiplier: 2,
      veteran: false,
    },
    setup: { maxOnPitch: 7, minOnLineOfScrimmage: 1, maxPerWideZone: 1 },
    kickoffTable: () => STREET_BOWL,
    weatherTable: () => STREET_BOWL,
    injuryTable: "standard",
    kickDeviation: "d6",
    throwInDistance: "2d6",
    ballBounces: 2,
    armour: COBBLES,
    referee: false,
    foulRetribution: "rock",
    rushTarget: 2,
    secretWeaponsAfterDrive: "street-crowd",
    stallingPenalty: "crowd",
  },
  [BEACH_BOWL]: {
    gameType: BEACH_BOWL,
    venues: ["beach"],
    turnsPerHalf: 6,
    draft: {
      ...SEVENS_DRAFT,
      rerolls: { kind: "double-roster" },
      apothecary: false,
      veteran: false,
    },
    setup: { maxOnPitch: 7, minOnLineOfScrimmage: 2, maxPerWideZone: 1 },
    kickoffTable: () => BEACH_BOWL,
    weatherTable: () => BEACH_BOWL,
    injuryTable: BEACH_BOWL,
    kickDeviation: "lower-of-2d6",
    throwInDistance: "d6",
    ballBounces: 0,
    armour: {
      knockedDownOrFallsOver: 1,
      wallPush: 0,
      failedDodgeOrRush: -1,
      foul: 1,
    },
    referee: true,
    foulRetribution: "sand",
    rushTarget: 3,
    secretWeaponsAfterDrive: "one-drive",
    stallingPenalty: "crowd",
  },
  "gutter-bowl": {
    gameType: "gutter-bowl",
    venues: ["gutter-street", "gutter-sewer"],
    turnsPerHalf: 6,
    draft: {
      ...SEVENS_DRAFT,
      budget: 750_000,
      maxNonLinemen: 5,
      assistantCoaches: false,
      cheerleaders: false,
      apothecary: false,
      veteran: false,
    },
    setup: { maxOnPitch: 7, minOnLineOfScrimmage: 3, maxPerWideZone: 2 },
    kickoffTable: venueTable,
    weatherTable: venueTable,
    injuryTable: "standard",
    kickDeviation: "d6",
    throwInDistance: "2d6",
    ballBounces: 2,
    armour: { ...COBBLES, wallPush: 0 },
    referee: false,
    foulRetribution: "none",
    rushTarget: 2,
    secretWeaponsAfterDrive: "gutter-crowd",
    stallingPenalty: "bottle",
  },
};

export function gameTypeRules(gameType: GameType): GameTypeRules {
  return GAME_TYPE_RULES[gameType];
}
