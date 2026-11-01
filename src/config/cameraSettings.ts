/**
 * Each coach's own camera preferences: how close the camera sits, and how
 * much it moves on its own. Stored in this browser only and never sent to
 * the other coach, so in online play each coach sets their own camera.
 */

export const CAMERA_SETTINGS_KEY = "bb_camera_settings";

/**
 * Zoom is a scale on the camera's own framings. At 1 the resting view is
 * the overview of the pitch and both benches, and the action framing is the
 * match default. At 2 both sit twice as close.
 */
export const MIN_CAMERA_ZOOM = 1;
export const MAX_CAMERA_ZOOM = 2;
export const CAMERA_ZOOM_STEP = 0.25;

/**
 * How much the camera moves on its own. Off holds it where the coach put
 * it. Light frames the action from further back. Close is the full action
 * framing.
 */
export const CAMERA_FOLLOW_MODES = ["off", "light", "close"] as const;
export type CameraFollow = (typeof CAMERA_FOLLOW_MODES)[number];

export interface CameraSettings {
  zoom: number;
  follow: CameraFollow;
}

/** The match camera as it plays for a coach who never opened the controls. */
export const DEFAULT_CAMERA_SETTINGS: CameraSettings = {
  zoom: MIN_CAMERA_ZOOM,
  follow: "close",
};

/** Clamp a zoom to the allowed range, on the step grid. */
export function clampCameraZoom(zoom: number): number {
  const stepped = Math.round(zoom / CAMERA_ZOOM_STEP) * CAMERA_ZOOM_STEP;
  return Math.min(MAX_CAMERA_ZOOM, Math.max(MIN_CAMERA_ZOOM, stepped));
}

const isFollow = (value: unknown): value is CameraFollow =>
  CAMERA_FOLLOW_MODES.some((mode) => mode === value);

/** Read settings from storage, keeping each valid field. */
export function parseCameraSettings(raw: unknown): CameraSettings {
  const fields: { zoom?: unknown; follow?: unknown } =
    typeof raw === "object" && raw !== null ? raw : {};
  const zoom = fields.zoom;
  return {
    zoom:
      typeof zoom === "number" && Number.isFinite(zoom)
        ? clampCameraZoom(zoom)
        : DEFAULT_CAMERA_SETTINGS.zoom,
    follow: isFollow(fields.follow)
      ? fields.follow
      : DEFAULT_CAMERA_SETTINGS.follow,
  };
}

/** The stored settings, or the defaults when absent or unreadable. */
export function loadCameraSettings(): CameraSettings {
  try {
    const stored = localStorage.getItem(CAMERA_SETTINGS_KEY);
    if (!stored) return { ...DEFAULT_CAMERA_SETTINGS };
    return parseCameraSettings(JSON.parse(stored));
  } catch {
    return { ...DEFAULT_CAMERA_SETTINGS };
  }
}

export function saveCameraSettings(settings: CameraSettings): void {
  try {
    localStorage.setItem(CAMERA_SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Storage is unavailable, as in some private windows: the settings
    // apply for this match but will not persist.
  }
}
