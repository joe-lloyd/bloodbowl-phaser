/**
 * Per-viewer camera preferences: resting zoom + follow intensity.
 *
 * Persisted to localStorage (per browser = per viewer) and applied live to
 * the match scene's CameraController. Deliberately NOT part of any online
 * sync — each coach controls only their own camera.
 */

export const CAMERA_SETTINGS_KEY = "bb_camera_settings";

/** Highest zoom the HUD control offers and the resting state allows. */
export const MAX_CAMERA_ZOOM = 2.5;

export interface CameraSettings {
  /** Resting zoom the camera returns to after any tracked action. */
  zoom: number;
  /** 0 = follow off (camera stays back) … 1 = close chase. */
  followIntensity: number;
}

/**
 * Defaults for a coach who never touched the settings: the untouched default
 * framing and a gentle ("Light") follow.
 */
export const DEFAULT_CAMERA_SETTINGS: CameraSettings = {
  zoom: 1.0,
  followIntensity: 0.35,
};

function sanitize(raw: unknown): CameraSettings {
  const s = (raw ?? {}) as Partial<CameraSettings>;
  return {
    zoom:
      typeof s.zoom === "number" && Number.isFinite(s.zoom)
        ? s.zoom
        : DEFAULT_CAMERA_SETTINGS.zoom,
    followIntensity:
      typeof s.followIntensity === "number" &&
      Number.isFinite(s.followIntensity)
        ? Math.min(1, Math.max(0, s.followIntensity))
        : DEFAULT_CAMERA_SETTINGS.followIntensity,
  };
}

/** Read the stored settings, falling back to defaults when absent/corrupt. */
export function loadCameraSettings(): CameraSettings {
  try {
    const stored = localStorage.getItem(CAMERA_SETTINGS_KEY);
    if (!stored) return { ...DEFAULT_CAMERA_SETTINGS };
    return sanitize(JSON.parse(stored));
  } catch {
    return { ...DEFAULT_CAMERA_SETTINGS };
  }
}

export function saveCameraSettings(settings: CameraSettings): void {
  try {
    localStorage.setItem(CAMERA_SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Storage unavailable (private mode etc.) — settings just won't persist.
  }
}

/**
 * The fit-whole-pitch zoom is only computable once a match scene exists
 * (it depends on the camera and pitch size). The scene registers it here so
 * the HUD control can offer "fit pitch" and use it as the zoom floor.
 */
let fitZoom: number | null = null;

export function registerCameraFitZoom(zoom: number | null): void {
  fitZoom = zoom;
}

export function getCameraFitZoom(): number | null {
  return fitZoom;
}
