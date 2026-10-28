import {
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
      aria-label="Match style"
      className={`grid gap-3 ${
        compact ? "grid-cols-2" : "sm:grid-cols-2"
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
