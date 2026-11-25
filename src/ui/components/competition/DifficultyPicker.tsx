import { DIFFICULTIES, type Difficulty } from "../../../simulation/ai/difficulty";
import { ChoiceText } from "../componentWarehouse/HudTitle";
import { choiceKeys } from "../componentWarehouse/choiceKeys";
import { cx, hudChoiceClass } from "../componentWarehouse/HudKit";

export function DifficultyPicker({
  value,
  onChange,
}: {
  value: Difficulty;
  onChange: (value: Difficulty) => void;
}) {
  const keys = choiceKeys({ ids: DIFFICULTIES.map(({ id }) => id), value, onChange });
  return (
    <>
      <p className="hud-label mb-2 mt-5">How hard the computer plays</p>
      <div
        role="radiogroup"
        aria-label="How hard the computer plays"
        className="grid max-w-2xl grid-cols-3 gap-2"
      >
        {DIFFICULTIES.map(({ id, label, detail }) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={value === id}
            {...keys(id)}
            className={cx(hudChoiceClass(value === id), "px-4 py-3 text-left")}
            onClick={() => {
              onChange(id);
            }}
          >
            <ChoiceText title={label} detail={detail} />
          </button>
        ))}
      </div>
    </>
  );
}
