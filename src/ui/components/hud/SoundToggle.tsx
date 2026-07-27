import React, { useState } from "react";
import { useSoundSettings } from "../../sound/useSoundSettings";

/** Compact HUD mute + volume control — settings persist via useSoundSettings/localStorage. */
export const SoundToggle: React.FC = () => {
  const settings = useSoundSettings();
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="flex flex-col items-end gap-1 pointer-events-auto">
      <button
        onClick={() => setExpanded((prev) => !prev)}
        title={settings.muted ? "Sound muted" : "Sound on"}
        className="w-9 h-9 flex items-center justify-center rounded border-2 border-bb-gold bg-bb-deep-crimson text-lg"
      >
        {settings.muted ? "🔇" : "🔊"}
      </button>
      {expanded && (
        <div className="flex flex-col gap-2 p-3 bg-bb-deep-crimson border-2 border-bb-gold rounded shadow-chunky">
          <label className="flex items-center gap-2 text-bb-parchment text-sm">
            <input
              type="checkbox"
              checked={settings.muted}
              onChange={(e) => settings.setMuted(e.target.checked)}
            />
            Mute
          </label>
          <label className="flex flex-col gap-1 text-bb-parchment text-sm">
            Volume
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={settings.volume}
              onChange={(e) => settings.setVolume(Number(e.target.value))}
            />
          </label>
        </div>
      )}
    </div>
  );
};
