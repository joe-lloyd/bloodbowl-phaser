import React from "react";
import { useSoundSettings } from "../../sound/useSoundSettings";

/**
 * Inline mute + volume control — settings persist via
 * useSoundSettings/localStorage. Rendered as a panel entry inside the
 * Match Options menu (see MatchOptionsMenu.tsx/computeMatchOptionsMenu.ts);
 * it no longer has its own floating popup, so both controls are shown
 * directly rather than behind a second expand step.
 */
export const SoundToggle: React.FC = () => {
  const settings = useSoundSettings();

  return (
    <div className="flex flex-col gap-2 pointer-events-auto">
      <label className="flex items-center gap-2 text-bb-parchment text-sm">
        <input
          type="checkbox"
          checked={settings.muted}
          onChange={(e) => settings.setMuted(e.target.checked)}
        />
        Mute sound
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
  );
};
