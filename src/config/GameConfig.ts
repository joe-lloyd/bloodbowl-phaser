const PITCH_WIDTH = 20;
const PITCH_HEIGHT = 11;
const SQUARE_SIZE = 60;

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

export function isKickingTeamTerritory(
  x: number,
  isTeam1Kicking: boolean
): boolean {
  return isTeam1Kicking
    ? x <= SEVENS_GEOMETRY.LINE_OF_SCRIMMAGE_X.team1
    : x >= SEVENS_GEOMETRY.LINE_OF_SCRIMMAGE_X.team2;
}

export const TRAPDOOR_SQUARES: readonly { x: number; y: number }[] = [
  { x: 5, y: 1 },
  { x: 14, y: 9 },
];

export function isTrapdoorSquare(x: number, y: number): boolean {
  return TRAPDOOR_SQUARES.some((square) => square.x === x && square.y === y);
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

const PITCH_PIXEL_WIDTH = PITCH_WIDTH * SQUARE_SIZE;
const PITCH_PIXEL_HEIGHT = PITCH_HEIGHT * SQUARE_SIZE;

const PADDING_X = 20;
const TOP_UI_HEIGHT = 160;
const BOTTOM_UI_HEIGHT = 160;

const CANVAS_WIDTH = PITCH_PIXEL_WIDTH + PADDING_X;
const CANVAS_HEIGHT = PITCH_PIXEL_HEIGHT + TOP_UI_HEIGHT + BOTTOM_UI_HEIGHT;

export const GameConfig = {
  PITCH_WIDTH,
  PITCH_HEIGHT,
  SQUARE_SIZE,

  SEVENS_GEOMETRY,

  PITCH_PIXEL_WIDTH,
  PITCH_PIXEL_HEIGHT,

  CANVAS_WIDTH,
  CANVAS_HEIGHT,

  TOP_UI_HEIGHT,
  BOTTOM_UI_HEIGHT,

  TURNS_PER_HALF: 6,
  TOTAL_HALVES: 2,

  STARTING_GOLD: 600000,

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

type GameConfigType = typeof GameConfig;
