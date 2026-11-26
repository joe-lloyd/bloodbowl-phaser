import { activeLayout, activeRules } from "../game/variants/activeMatch";
import type { PitchLayout, Square } from "../game/variants/pitchLayouts";

const SQUARE_SIZE = 60;

function geometryOf(layout: PitchLayout) {
  const { lineOfScrimmage, noMansLand } = layout;
  return {
    END_ZONE_X: { team1: 0, team2: layout.cols - 1 },
    LINE_OF_SCRIMMAGE_X: lineOfScrimmage,
    NEUTRAL_ZONE_X: noMansLand ?? {
      min: lineOfScrimmage.team1 + 1,
      max: lineOfScrimmage.team2 - 1,
    },
    CENTRE_FIELD_ROWS: layout.centreRows,
    WIDE_ZONE_ROWS: layout.wideZoneRows,
  };
}

const geometries = new Map<PitchLayout, ReturnType<typeof geometryOf>>();

function layoutGeometry() {
  const layout = activeLayout();
  const known = geometries.get(layout);
  if (known) return known;
  const geometry = geometryOf(layout);
  geometries.set(layout, geometry);
  return geometry;
}

export const SEVENS_GEOMETRY = {
  get END_ZONE_X() {
    return layoutGeometry().END_ZONE_X;
  },
  get LINE_OF_SCRIMMAGE_X() {
    return layoutGeometry().LINE_OF_SCRIMMAGE_X;
  },
  get NEUTRAL_ZONE_X() {
    return layoutGeometry().NEUTRAL_ZONE_X;
  },
  get CENTRE_FIELD_ROWS() {
    return layoutGeometry().CENTRE_FIELD_ROWS;
  },
  get WIDE_ZONE_ROWS() {
    return layoutGeometry().WIDE_ZONE_ROWS;
  },
};

export function getSevensSetupZone(isTeam1: boolean) {
  const { cols, lineOfScrimmage } = activeLayout();
  return isTeam1
    ? { minX: 0, maxX: lineOfScrimmage.team1 }
    : { minX: lineOfScrimmage.team2, maxX: cols - 1 };
}

export function getLineOfScrimmageX(isTeam1: boolean): number {
  const { lineOfScrimmage } = activeLayout();
  return isTeam1 ? lineOfScrimmage.team1 : lineOfScrimmage.team2;
}

export function isKickingTeamTerritory(
  x: number,
  isTeam1Kicking: boolean
): boolean {
  const { lineOfScrimmage } = activeLayout();
  return isTeam1Kicking
    ? x <= lineOfScrimmage.team1
    : x >= lineOfScrimmage.team2;
}

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

export function getWideZone(y: number): "top" | "bottom" | null {
  const { top, bottom } = activeLayout().wideZoneRows;
  if (y >= top.min && y <= top.max) return "top";
  if (y >= bottom.min && y <= bottom.max) return "bottom";
  return null;
}

export function isCentreFieldRow(y: number): boolean {
  const { min, max } = activeLayout().centreRows;
  return y >= min && y <= max;
}

export function isNeutralZoneX(x: number): boolean {
  const zone = activeLayout().noMansLand;
  return zone !== null && x >= zone.min && x <= zone.max;
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

  SEVENS_GEOMETRY,

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
