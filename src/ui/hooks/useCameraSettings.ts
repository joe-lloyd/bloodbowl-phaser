import { useCallback, useState } from "react";
import { IEventBus } from "../../services/EventBus";
import { GameEventNames } from "../../types/events";
import {
  CameraSettings,
  getCameraFitZoom,
  loadCameraSettings,
  saveCameraSettings,
} from "../../config/cameraSettings";

/**
 * Per-viewer camera settings (resting zoom + follow intensity), persisted
 * to localStorage and pushed live to the match scene's CameraController via
 * UI_CameraSettingsChanged. Local only — never synced in online play.
 */
export function useCameraSettings(eventBus: IEventBus) {
  const [settings, setSettings] = useState<CameraSettings>(() =>
    loadCameraSettings()
  );

  /** Fit-whole-pitch zoom (registered by the scene); null before a match. */
  const fitZoom = getCameraFitZoom();

  const update = useCallback(
    (patch: Partial<CameraSettings>) => {
      setSettings((prev) => {
        const next = { ...prev, ...patch };
        saveCameraSettings(next);
        eventBus.emit(GameEventNames.UI_CameraSettingsChanged, next);
        return next;
      });
    },
    [eventBus]
  );

  return { settings, fitZoom, update };
}
