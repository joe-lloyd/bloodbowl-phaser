/**
 * Blood Bowl Sevens Game Configuration (2020 Rules)
 * Contains all game constants and rules
 */

export const GameConfig = {
  // Pitch dimensions (Sevens rotated: 20 wide × 11 high - HORIZONTAL orientation)
  PITCH_WIDTH: 20, // 20 columns (rotated from 11×20 vertical)
  PITCH_HEIGHT: 11, // 11 rows
  SQUARE_SIZE: 60, // Increased from 40 to 60 for HD

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

  // Canvas size - optimized for widescreen with horizontal dugouts
  CANVAS_WIDTH: 1920, // Full HD width
  CANVAS_HEIGHT: 1080, // Full HD height
} as const;

export type GameConfigType = typeof GameConfig;
