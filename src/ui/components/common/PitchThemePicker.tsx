import {
  PITCH_THEMES,
  PitchThemeId,
  resolvePitchTheme,
} from "../../../game/presentation/pitchThemes";
import { cx, hudChoiceClass } from "../componentWarehouse/HudKit";

interface PitchThemePickerProps {
  value?: string | null;
  onChange: (themeId: PitchThemeId) => void;
  disabled?: boolean;
  compact?: boolean;
}

/**
 * Shared local/online pre-match picker. It deliberately consumes the same
 * catalog as Phaser, so labels, ids, and preview palettes cannot drift.
 */
export function PitchThemePicker({
  value,
  onChange,
  disabled = false,
  compact = false,
}: PitchThemePickerProps) {
  const selected = resolvePitchTheme(value).id;

  return (
    <div
      role="group"
      aria-label="Match style"
      className={`grid gap-3 ${compact ? "grid-cols-2" : "sm:grid-cols-2"}`}
    >
      {PITCH_THEMES.map((theme) => {
        const active = selected === theme.id;
        return (
          <button
            key={theme.id}
            type="button"
            disabled={disabled}
            aria-pressed={active}
            onClick={() => onChange(theme.id)}
            className={cx(hudChoiceClass(active), "min-h-11 overflow-hidden")}
          >
            <span
              className="relative block aspect-video border-b border-black/30 bg-cover bg-center"
              style={{
                backgroundColor: theme.swatch.ground,
                backgroundImage: `url(${theme.stadiumPath}/preview.webp)`,
              }}
            >
              <span
                className="absolute inset-x-0 bottom-0 h-1"
                style={{ backgroundColor: theme.swatch.trim }}
              />
            </span>
            <span className="block bg-hud-sunk/80 px-3 py-2">
              <span
                className={cx(
                  "block font-hud-label text-hud-base font-bold uppercase tracking-[0.04em]",
                  active ? "text-hud-gold" : "text-hud-bone"
                )}
              >
                {theme.name}
              </span>
              {!compact && (
                <span className="mt-0.5 block font-hud-body text-hud-sm text-hud-dim">
                  {theme.description}
                </span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}
