import type { Surface } from "../variants/pitchLayouts";
import { colorDistance } from "./kits";

const KICK_TARGET_COLORS = [0xff2b2b, 0x3dff5c, 0x1fa2ff] as const;

const SURFACE_COLOR: Record<Surface, number> = {
  grass: 0x3f7d33,
  cobbles: 0x6b645b,
  sand: 0xcbb994,
  sewer: 0x46503f,
};

export function kickTargetColor(
  teamColors: readonly number[],
  surface: Surface
): number {
  const avoid = [...teamColors, SURFACE_COLOR[surface]];
  const clearance = (color: number) =>
    Math.min(...avoid.map((other) => colorDistance(color, other)));
  return KICK_TARGET_COLORS.reduce((best, color) =>
    clearance(color) > clearance(best) ? color : best
  );
}
