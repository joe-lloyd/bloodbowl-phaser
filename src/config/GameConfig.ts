/**
 * Blood Bowl Sevens Game Configuration (2020 Rules)
 * Contains all game constants and rules
 */

// Pitch dimensions (Sevens rotated: 20 wide × 11 high - HORIZONTAL orientation)
const PITCH_WIDTH = 20; // 20 columns
const PITCH_HEIGHT = 11; // 11 rows
const SQUARE_SIZE = 60; // Grid square size in pixels

/** Shared Sevens pitch geometry (all values are zero-based grid squares). */
export const SEVENS_GEOMETRY = {
  END_ZONE_X: { team1: 0, team2: PITCH_WIDTH - 1 },
  LINE_OF_SCRIMMAGE_X: { team1: 6, team2: 13 },
  NEUTRAL_ZONE_X: { min: 7, max: 12 },
  CENTRE_FIELD_ROWS: { min: 2, max: 8 },
  WIDE_ZONE_ROWS: {
    top: { min: 0, max: 1 },
    bottom: { min: 9, max: 10 },
  },
} as const;

export function getSevensSetupZone(isTeam1: boolean) {
  return isTeam1
    ? { minX: 0, maxX: SEVENS_GEOMETRY.LINE_OF_SCRIMMAGE_X.team1 }
    : {
        minX: SEVENS_GEOMETRY.LINE_OF_SCRIMMAGE_X.team2,
        maxX: PITCH_WIDTH - 1,
      };
}

export function getLineOfScrimmageX(isTeam1: boolean): number {
  return isTeam1
    ? SEVENS_GEOMETRY.LINE_OF_SCRIMMAGE_X.team1
    : SEVENS_GEOMETRY.LINE_OF_SCRIMMAGE_X.team2;
}

export function getWideZone(y: number): "top" | "bottom" | null {
  const { top, bottom } = SEVENS_GEOMETRY.WIDE_ZONE_ROWS;
  if (y >= top.min && y <= top.max) return "top";
  if (y >= bottom.min && y <= bottom.max) return "bottom";
  return null;
}

export function isCentreFieldRow(y: number): boolean {
  const { min, max } = SEVENS_GEOMETRY.CENTRE_FIELD_ROWS;
  return y >= min && y <= max;
}

export function isNeutralZoneX(x: number): boolean {
  const { min, max } = SEVENS_GEOMETRY.NEUTRAL_ZONE_X;
  return x >= min && x <= max;
}

const PITCH_PIXEL_WIDTH = PITCH_WIDTH * SQUARE_SIZE; // 1200
const PITCH_PIXEL_HEIGHT = PITCH_HEIGHT * SQUARE_SIZE; // 660

const PADDING_X = 20; // Reduced padding
const TOP_UI_HEIGHT = 160; // 150px Dugout + 10px Padding
const BOTTOM_UI_HEIGHT = 160; // 10px Padding + 150px Dugout

const CANVAS_WIDTH = PITCH_PIXEL_WIDTH + PADDING_X; // 1300
const CANVAS_HEIGHT = PITCH_PIXEL_HEIGHT + TOP_UI_HEIGHT + BOTTOM_UI_HEIGHT; // 1000

export const GameConfig = {
  // Grid Dimensions
  PITCH_WIDTH,
  PITCH_HEIGHT,
  SQUARE_SIZE,

  // Sevens pitch geometry
  SEVENS_GEOMETRY,

  // Pixel Dimensions (Derived)
  PITCH_PIXEL_WIDTH,
  PITCH_PIXEL_HEIGHT,

  // Canvas Dimensions (Derived)
  CANVAS_WIDTH,
  CANVAS_HEIGHT,

  // UI Layout Constants
  TOP_UI_HEIGHT,
  BOTTOM_UI_HEIGHT,

  // Game structure
  TURNS_PER_HALF: 6,
  TOTAL_HALVES: 2,

  // Team building
  STARTING_GOLD: 600000,
  MIN_PLAYERS: 7,
  MAX_ROSTER_SIZE: 11,

  // SPP (Star Player Points) thresholds
  SPP_THRESHOLDS: [6, 16, 31, 51, 76, 176],

  // SPP awards
  SPP_TOUCHDOWN: 3,
  SPP_CASUALTY: 2,
  SPP_COMPLETION: 1,
  SPP_MVP: 4,

  // Dice
  D6_SIDES: 6,
  BLOCK_DICE_MAX: 3,

  // Colors
  COLORS: {
    PITCH_GREEN: 0x2d5016,
    PITCH_LINE: 0xffffff,
    TEAM_1: 0xff4444,
    TEAM_2: 0x4444ff,
    HIGHLIGHT_MOVE: 0x44ff44,
    HIGHLIGHT_BLOCK: 0xff8844,
    HIGHLIGHT_SELECT: 0xffff44,
  },
} as const;

export type GameConfigType = typeof GameConfig;
