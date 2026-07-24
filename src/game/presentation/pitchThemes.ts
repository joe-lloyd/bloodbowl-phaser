import { GameConfig } from "../../config/GameConfig";

export const PITCH_THEME_IDS = [
  "classic",
  "mud",
  "astro",
  "wasteland",
] as const;

export type PitchThemeId = (typeof PITCH_THEME_IDS)[number];

export interface PitchTheme {
  id: PitchThemeId;
  name: string;
  description: string;
  surface: {
    top: number;
    bottom: number;
    stripe: number;
    detail: number;
    textureKey?: string;
  };
  endZones: {
    left: number;
    right: number;
    alpha: number;
    border: number;
  };
  wideZones: {
    fill: number;
    alpha: number;
    line: number;
  };
  lines: {
    grid: number;
    gridAlpha: number;
    gridWidth: number;
    major: number;
    majorAlpha: number;
    majorWidth: number;
    setupWidth: number;
  };
  dugout: {
    background: number;
    panel: number;
    border: number;
    label: number;
    slotFill: number;
    slotLine: number;
    staffRail: number;
    ko: number;
    casualty: number;
  };
}

/**
 * Fixed, drawn-first presentation catalog. Optional texture keys are overlays:
 * the corresponding theme still renders completely when the asset is absent.
 */
export const PITCH_THEMES: readonly PitchTheme[] = [
  {
    id: "classic",
    name: "Classic Grass",
    description: "Traditional deep turf with crisp white chalk.",
    surface: {
      top: GameConfig.COLORS.PITCH_GREEN,
      bottom: 0x244714,
      stripe: 0x6f8f3f,
      detail: 0xb8cf7a,
    },
    endZones: {
      left: 0x4444ff,
      right: 0xff4444,
      alpha: 0.8,
      border: 0xf3e9d2,
    },
    wideZones: {
      fill: 0x193a10,
      alpha: 0.14,
      line: GameConfig.COLORS.PITCH_LINE,
    },
    lines: {
      grid: GameConfig.COLORS.PITCH_LINE,
      gridAlpha: 0.3,
      gridWidth: 1,
      major: GameConfig.COLORS.PITCH_LINE,
      majorAlpha: 0.88,
      majorWidth: 2,
      setupWidth: 4,
    },
    dugout: {
      background: 0x101827,
      panel: 0x1a1a2e,
      border: 0xd6b25e,
      label: 0xf3e9d2,
      slotFill: 0x05070d,
      slotLine: 0xffffff,
      staffRail: 0x17233a,
      ko: 0xd98916,
      casualty: 0x922d26,
    },
  },
  {
    id: "mud",
    name: "Midden Mud",
    description: "A rain-soaked brown pitch churned by heavy boots.",
    surface: {
      top: 0x5c4a2b,
      bottom: 0x302718,
      stripe: 0x80663a,
      detail: 0xb29558,
      textureKey: "pitch-theme-mud",
    },
    endZones: {
      left: 0x324f73,
      right: 0x7a2923,
      alpha: 0.8,
      border: 0xe6d4aa,
    },
    wideZones: {
      fill: 0x21190f,
      alpha: 0.24,
      line: 0xe6d4aa,
    },
    lines: {
      grid: 0xf0dfb6,
      gridAlpha: 0.25,
      gridWidth: 1,
      major: 0xffe9b8,
      majorAlpha: 0.86,
      majorWidth: 3,
      setupWidth: 5,
    },
    dugout: {
      background: 0x1c1710,
      panel: 0x34291b,
      border: 0xb58b49,
      label: 0xf0dfb6,
      slotFill: 0x100d09,
      slotLine: 0xe6d4aa,
      staffRail: 0x2a2116,
      ko: 0xb87322,
      casualty: 0x7d251e,
    },
  },
  {
    id: "astro",
    name: "Doomdome Astro",
    description: "Cold tournament turf under electric arena markings.",
    surface: {
      top: 0x174c55,
      bottom: 0x0b2832,
      stripe: 0x2d7580,
      detail: 0x62c4c7,
      textureKey: "pitch-theme-astro",
    },
    endZones: {
      left: 0x3853a4,
      right: 0xa22d4a,
      alpha: 0.8,
      border: 0xd9f7f4,
    },
    wideZones: {
      fill: 0x071f2a,
      alpha: 0.2,
      line: 0xa8e6e3,
    },
    lines: {
      grid: 0xb7f1ee,
      gridAlpha: 0.28,
      gridWidth: 1,
      major: 0xe4fffc,
      majorAlpha: 0.92,
      majorWidth: 2,
      setupWidth: 4,
    },
    dugout: {
      background: 0x07151f,
      panel: 0x102b38,
      border: 0x4fb8bd,
      label: 0xe4fffc,
      slotFill: 0x030c12,
      slotLine: 0xa8e6e3,
      staffRail: 0x0c2330,
      ko: 0xd39b35,
      casualty: 0xa22d4a,
    },
  },
  {
    id: "wasteland",
    name: "Ash Wastes",
    description: "Cracked ochre ground bordered by scorched chalk.",
    surface: {
      top: 0x77613d,
      bottom: 0x3d3528,
      stripe: 0x9a8051,
      detail: 0xc2a56a,
      textureKey: "pitch-theme-wasteland",
    },
    endZones: {
      left: 0x4b4e69,
      right: 0x793c2f,
      alpha: 0.8,
      border: 0xe7d3a5,
    },
    wideZones: {
      fill: 0x2b251c,
      alpha: 0.22,
      line: 0xe7d3a5,
    },
    lines: {
      grid: 0xe7d3a5,
      gridAlpha: 0.24,
      gridWidth: 1,
      major: 0xffe4aa,
      majorAlpha: 0.86,
      majorWidth: 3,
      setupWidth: 5,
    },
    dugout: {
      background: 0x211d18,
      panel: 0x3b3125,
      border: 0xb59645,
      label: 0xf3e9d2,
      slotFill: 0x15120e,
      slotLine: 0xd6c093,
      staffRail: 0x30271d,
      ko: 0xb8792c,
      casualty: 0x7c3028,
    },
  },
] as const;

export const DEFAULT_PITCH_THEME_ID: PitchThemeId = "classic";

export function isPitchThemeId(value: unknown): value is PitchThemeId {
  return (
    typeof value === "string" &&
    (PITCH_THEME_IDS as readonly string[]).includes(value)
  );
}

export function resolvePitchTheme(id?: string | null): PitchTheme {
  return (
    PITCH_THEMES.find((theme) => theme.id === id) ??
    PITCH_THEMES.find((theme) => theme.id === DEFAULT_PITCH_THEME_ID)!
  );
}

/**
 * Pitch consumes this single presentation object. Geometry always comes from
 * GameConfig and is therefore identical for every theme.
 */
export function getPitchPresentation(id?: string | null) {
  return {
    theme: resolvePitchTheme(id),
    width: GameConfig.PITCH_WIDTH,
    height: GameConfig.PITCH_HEIGHT,
    squareSize: GameConfig.SQUARE_SIZE,
    pixelWidth: GameConfig.PITCH_PIXEL_WIDTH,
    pixelHeight: GameConfig.PITCH_PIXEL_HEIGHT,
  } as const;
}

export function colorToCss(color: number): string {
  return `#${color.toString(16).padStart(6, "0")}`;
}
