import React from "react";
import { EventBus } from "../../../services/EventBus";
import { useCameraSettings } from "../../hooks/useCameraSettings";
import { MAX_CAMERA_ZOOM } from "../../../config/cameraSettings";

interface CameraControlsProps {
  eventBus: EventBus;
}

const ZOOM_STEP = 0.1;

/**
 * CameraControls - Per-viewer camera preferences, applied live mid-match:
 * resting zoom (in/out + fit whole pitch) and a follow-intensity slider
 * from Off through Light to Close. Persisted to localStorage; local only.
 */
export const CameraControls: React.FC<CameraControlsProps> = ({ eventBus }) => {
  const { settings, fitZoom, update } = useCameraSettings(eventBus);
  const minZoom = fitZoom ?? 0.5;

  const setZoom = (zoom: number) => {
    const clamped = Math.min(MAX_CAMERA_ZOOM, Math.max(minZoom, zoom));
    update({ zoom: Math.max(minZoom, Math.round(clamped * 100) / 100) });
  };

  const followLabel =
    settings.followIntensity === 0
      ? "Off"
      : settings.followIntensity < 0.5
        ? "Light"
        : "Close";

  return (
    <div className="w-full pointer-events-auto border-2 border-bb-gold rounded-md bg-black/60 px-3 py-2">
      <div className="font-heading text-bb-gold text-sm uppercase tracking-wide mb-2">
        Camera
      </div>

      {/* Resting zoom: out / in / fit whole pitch */}
      <div className="flex items-center gap-2 mb-2">
        <button
          onClick={() => setZoom(settings.zoom - ZOOM_STEP)}
          disabled={settings.zoom <= minZoom}
          title="Zoom out"
          className="w-7 h-7 rounded border border-bb-dark-gold bg-bb-deep-crimson text-bb-parchment font-bold disabled:opacity-40"
        >
          −
        </button>
        <span className="flex-1 text-center text-xs text-bb-parchment font-mono">
          {settings.zoom.toFixed(2)}×
        </span>
        <button
          onClick={() => setZoom(settings.zoom + ZOOM_STEP)}
          disabled={settings.zoom >= MAX_CAMERA_ZOOM}
          title="Zoom in"
          className="w-7 h-7 rounded border border-bb-dark-gold bg-bb-deep-crimson text-bb-parchment font-bold disabled:opacity-40"
        >
          +
        </button>
        <button
          onClick={() => fitZoom !== null && setZoom(fitZoom)}
          disabled={fitZoom === null}
          title="Fit the whole pitch"
          className="px-2 h-7 rounded border border-bb-dark-gold bg-bb-deep-crimson text-bb-parchment font-heading text-xs uppercase disabled:opacity-40"
        >
          Fit pitch
        </button>
      </div>

      {/* Follow intensity: Off … Light … Close */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-400 uppercase">Follow</span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={settings.followIntensity}
          onChange={(e) =>
            update({ followIntensity: parseFloat(e.target.value) })
          }
          className="min-w-0 flex-1 accent-bb-gold"
          aria-label="Follow intensity"
        />
        <span className="w-10 shrink-0 text-right text-xs text-bb-parchment">
          {followLabel}
        </span>
      </div>
    </div>
  );
};
