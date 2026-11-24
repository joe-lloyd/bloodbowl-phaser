import type { ScreenRect } from "./CameraController";
import { ISO } from "../elements/GridUtils";

const ZOOMED_OUT_TILE_PX = 20;
const ZOOMED_IN_TILE_PX = 28;
const LEAST_CLEAR_SHARE = 0.18;

const PHONE_MIN_ZOOM = ZOOMED_OUT_TILE_PX / ISO.tileHeight;
const PHONE_MAX_ZOOM = ZOOMED_IN_TILE_PX / ISO.tileHeight;

export function phoneZoom({
  fit,
  current,
  coachZoomed,
}: {
  fit: number;
  current: number;
  coachZoomed: boolean;
}): number {
  if (coachZoomed) return current;
  const wanted = Math.min(Math.max(fit, PHONE_MIN_ZOOM), PHONE_MAX_ZOOM);
  return current < PHONE_MIN_ZOOM ? wanted : Math.min(current, wanted);
}

export function phoneArea(
  clear: ScreenRect,
  size: { width: number; height: number }
): ScreenRect {
  const roomy =
    clear.right - clear.left >= size.width * LEAST_CLEAR_SHARE &&
    clear.bottom - clear.top >= size.height * LEAST_CLEAR_SHARE;
  if (roomy) return clear;
  return {
    left: size.width * 0.06,
    top: size.height * 0.24,
    right: size.width * 0.94,
    bottom: size.height * 0.86,
  };
}
