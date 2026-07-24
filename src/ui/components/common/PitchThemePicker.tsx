import {
  colorToCss,
  PITCH_THEMES,
  PitchThemeId,
  resolvePitchTheme,
} from "../../../game/presentation/pitchThemes";

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
      aria-label="Pitch theme"
      className={`grid gap-3 ${
        compact ? "grid-cols-2" : "sm:grid-cols-2 xl:grid-cols-4"
      }`}
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
            className={`min-h-11 overflow-hidden rounded border-2 text-left
              transition-all duration-200 disabled:cursor-not-allowed
              disabled:opacity-70 ${
                active
                  ? "border-bb-gold shadow-chunky -translate-y-0.5"
                  : "border-bb-divider hover:border-bb-dark-gold hover:-translate-y-0.5"
              }`}
          >
            <span
              className="relative block h-12 border-b border-black/30"
              style={{
                background: `linear-gradient(180deg, ${colorToCss(
                  theme.surface.top
                )}, ${colorToCss(theme.surface.bottom)})`,
              }}
            >
              <span
                className="absolute inset-y-0 left-0 w-3 opacity-80"
                style={{ backgroundColor: colorToCss(theme.endZones.left) }}
              />
              <span
                className="absolute inset-y-0 right-0 w-3 opacity-80"
                style={{ backgroundColor: colorToCss(theme.endZones.right) }}
              />
              <span className="absolute inset-y-0 left-1/2 border-l-2 border-white/70" />
              <span className="absolute inset-x-0 top-1/2 border-t border-white/25" />
            </span>
            <span className="block bg-bb-warm-paper px-3 py-2">
              <span className="block font-heading text-sm uppercase text-bb-text-dark">
                {theme.name}
              </span>
              {!compact && (
                <span className="mt-1 block font-body text-xs leading-tight text-bb-muted-text">
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
