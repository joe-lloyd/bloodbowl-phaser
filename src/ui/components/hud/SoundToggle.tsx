import React from "react";
import { useSoundSettings } from "../../sound/useSoundSettings";
import { Field } from "../componentWarehouse/HudKit";

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
      <label className="flex items-center gap-2 font-hud-body text-hud-sm text-hud-bone">
        <input
          className="hud-check"
          type="checkbox"
          checked={settings.muted}
          onChange={(e) => settings.setMuted(e.target.checked)}
        />
        Mute sound
      </label>
      <Field label="Volume">
        <input
          className="accent-hud-gold"
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={settings.volume}
          onChange={(e) => settings.setVolume(Number(e.target.value))}
        />
      </Field>
    </div>
  );
};
