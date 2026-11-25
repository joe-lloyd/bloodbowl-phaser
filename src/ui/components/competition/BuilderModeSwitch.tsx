import type { CompetitionType } from "../../../competition/types";
import { ChoiceText } from "../componentWarehouse/HudTitle";
import { choiceKeys } from "../componentWarehouse/choiceKeys";
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
  const keys = choiceKeys({ ids: MODES.map((option) => option.id), value: mode, onChange });
  return (
    <div role="radiogroup" aria-label="Who plays" className="mb-6 grid gap-2 sm:grid-cols-2">
      {MODES.map((option) => (
        <button
          key={option.id}
          type="button"
          role="radio"
          aria-checked={mode === option.id}
          {...keys(option.id)}
          className={cx(hudChoiceClass(mode === option.id), "px-4 py-3 text-left")}
          onClick={() => {
            onChange(option.id);
          }}
        >
          <ChoiceText title={option.label} detail={option.detail(type)} />
        </button>
      ))}
    </div>
  );
}
