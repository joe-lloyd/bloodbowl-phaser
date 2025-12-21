/**
 * Blood Bowl Sevens Game Configuration (2020 Rules)
 * Contains all game constants and rules
 */

// Pitch dimensions (Sevens rotated: 20 wide × 11 high - HORIZONTAL orientation)
const PITCH_WIDTH = 20; // 20 columns
const PITCH_HEIGHT = 11; // 11 rows
const SQUARE_SIZE = 60; // Grid square size in pixels

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
