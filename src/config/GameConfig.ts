import { activeLayout, activeRules } from "../game/variants/activeMatch";
import type { Square } from "../game/variants/pitchLayouts";

const SQUARE_SIZE = 60;

export const TRAPDOOR_SQUARES: { readonly squares: readonly Square[] } = {
  get squares() {
    return activeLayout().trapdoors;
  },
};

export function isTrapdoorSquare(x: number, y: number): boolean {
  return activeLayout().trapdoors.some(
    (square) => square.x === x && square.y === y
  );
}

const PADDING_X = 20;
const TOP_UI_HEIGHT = 160;
const BOTTOM_UI_HEIGHT = 160;

export const GameConfig = {
  get PITCH_WIDTH() {
    return activeLayout().cols;
  },
  get PITCH_HEIGHT() {
    return activeLayout().rows;
  },
  SQUARE_SIZE,

  get CANVAS_WIDTH() {
    return activeLayout().cols * SQUARE_SIZE + PADDING_X;
  },
  get CANVAS_HEIGHT() {
    return activeLayout().rows * SQUARE_SIZE + TOP_UI_HEIGHT + BOTTOM_UI_HEIGHT;
  },

  TOP_UI_HEIGHT,
  BOTTOM_UI_HEIGHT,

  get TURNS_PER_HALF() {
    return activeRules().turnsPerHalf;
  },
  TOTAL_HALVES: 2,

  STARTING_GOLD: 600_000,

  MIN_PLAYERS: 7,
  MAX_ROSTER_SIZE: 11,

  SPP_THRESHOLDS: [6, 16, 31, 51, 76, 176],

  SPP_TOUCHDOWN: 3,
  SPP_CASUALTY: 2,
  SPP_COMPLETION: 1,
  SPP_MVP: 4,

  D6_SIDES: 6,
  BLOCK_DICE_MAX: 3,

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
