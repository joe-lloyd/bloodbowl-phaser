import React from "react";
import { IEventBus } from "../../../services/EventBus";
import { useCameraSettings } from "../../hooks/useCameraSettings";
import {
  CAMERA_FOLLOW_MODES,
  CAMERA_ZOOM_STEP,
  CameraFollow,
  clampCameraZoom,
  MAX_CAMERA_ZOOM,
  MIN_CAMERA_ZOOM,
} from "../../../config/cameraSettings";
import { cx, HudButton, hudChoiceClass } from "../componentWarehouse/HudKit";

const FOLLOW_LABEL: Record<CameraFollow, string> = {
  off: "Off",
  light: "Light",
  close: "Close",
};

const FOLLOW_HINT: Record<CameraFollow, string> = {
  off: "The camera stays where you put it.",
  light: "The camera follows the action from further back.",
  close: "The camera follows the action up close.",
};

/**
 * This coach's camera settings: a resting zoom with Fit pitch, and how
 * closely the camera follows the action. A panel entry in the Match Options
 * menu, beside the sound settings.
 */
export const CameraControls: React.FC<{ eventBus: IEventBus }> = ({
  eventBus,
}) => {
  const { settings, update } = useCameraSettings(eventBus);
  const setZoom = (zoom: number) => update({ zoom: clampCameraZoom(zoom) });
  const followLabelId = React.useId();

  return (
    <div className="flex flex-col gap-2 pointer-events-auto">
      <span className="hud-label">Camera zoom</span>
      <div
        role="group"
        aria-label="Camera zoom"
        className="flex items-center gap-1.5"
      >
        <HudButton
          size="xs"
          aria-label="Zoom out"
          disabled={settings.zoom <= MIN_CAMERA_ZOOM}
          onClick={() => setZoom(settings.zoom - CAMERA_ZOOM_STEP)}
        >
          −
        </HudButton>
        <span
          className="min-w-[48px] text-center font-hud-label text-hud-sm font-bold text-hud-bone"
          aria-live="polite"
        >
          {settings.zoom.toFixed(2)}×
        </span>
        <HudButton
          size="xs"
          aria-label="Zoom in"
          disabled={settings.zoom >= MAX_CAMERA_ZOOM}
          onClick={() => setZoom(settings.zoom + CAMERA_ZOOM_STEP)}
        >
          +
        </HudButton>
        <HudButton
          size="xs"
          variant="ghost"
          className="ml-auto"
          onClick={() => setZoom(MIN_CAMERA_ZOOM)}
        >
          Fit pitch
        </HudButton>
      </div>
      <span id={followLabelId} className="hud-label">
        Follow
      </span>
      <div
        role="group"
        aria-labelledby={followLabelId}
        className="grid grid-cols-3 gap-1"
      >
        {CAMERA_FOLLOW_MODES.map((mode) => {
          const selected = settings.follow === mode;
          return (
            <button
              key={mode}
              type="button"
              aria-pressed={selected}
              onClick={() => update({ follow: mode })}
              className={cx(
                hudChoiceClass(selected),
                "min-h-[28px] text-center font-hud-label text-hud-sm font-bold uppercase tracking-[0.06em]",
                selected ? "text-hud-gold" : "text-hud-dim"
              )}
            >
              {FOLLOW_LABEL[mode]}
            </button>
          );
        })}
      </div>
      <span className="font-hud-body text-hud-xs normal-case tracking-normal text-hud-dim">
        {FOLLOW_HINT[settings.follow]}
      </span>
    </div>
  );
};
