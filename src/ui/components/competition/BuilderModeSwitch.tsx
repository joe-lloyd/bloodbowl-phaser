import type { CompetitionType } from "../../../competition/types";
import { cx, hudChoiceClass } from "../componentWarehouse/HudKit";

export type BuilderMode = "local" | "online";

const MODES: readonly { id: BuilderMode; label: string; detail: (type: CompetitionType) => string }[] = [
  {
    id: "local",
    label: "Your teams",
    detail: () => "Enter your own teams and computer teams now, and play the games here.",
  },
  {
    id: "online",
    label: "Online sign-ups",
    detail: (type) =>
      `Open the ${type} for other coaches to enter their own teams. Computer teams fill the places left when you start.`,
  },
];

export function BuilderModeSwitch({
  type,
  mode,
  onChange,
}: {
  type: CompetitionType;
  mode: BuilderMode;
  onChange: (mode: BuilderMode) => void;
}) {
  return (
    <div role="radiogroup" aria-label="Who plays" className="mb-6 grid gap-2 sm:grid-cols-2">
      {MODES.map((option) => (
        <button
          key={option.id}
          type="button"
          role="radio"
          aria-checked={mode === option.id}
          className={cx(hudChoiceClass(mode === option.id), "px-4 py-3 text-left")}
          onClick={() => {
            onChange(option.id);
          }}
        >
          <span className="block font-hud-label text-hud-base font-bold uppercase tracking-[0.04em] text-hud-bone">
            {option.label}
          </span>
          <span className="block text-hud-sm text-hud-dim">{option.detail(type)}</span>
        </button>
      ))}
    </div>
  );
}
