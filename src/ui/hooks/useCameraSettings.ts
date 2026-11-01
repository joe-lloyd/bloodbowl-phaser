import { useState } from "react";
import { IEventBus } from "../../services/EventBus";
import { GameEventNames } from "../../types/events";
import {
  CameraSettings,
  loadCameraSettings,
  saveCameraSettings,
} from "../../config/cameraSettings";

/**
 * This coach's camera settings. A change is saved in this browser and sent
 * to the match camera at once. It never goes to the other coach.
 */
export function useCameraSettings(eventBus: IEventBus) {
  const [settings, setSettings] = useState(loadCameraSettings);

  const update = (patch: Partial<CameraSettings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    saveCameraSettings(next);
    eventBus.emit(GameEventNames.UI_CameraSettingsChanged, next);
  };

  return { settings, update };
}
