import { DIFFICULTIES, type Difficulty } from "../../../simulation/ai/difficulty";
import { cx, hudChoiceClass } from "../componentWarehouse/HudKit";

export function DifficultyPicker({
  value,
  onChange,
}: {
  value: Difficulty;
  onChange: (value: Difficulty) => void;
}) {
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
            className={cx(hudChoiceClass(value === id), "px-4 py-3 text-left")}
            onClick={() => {
              onChange(id);
            }}
          >
            <span className="block font-hud-label text-hud-base font-bold uppercase tracking-[0.04em] text-hud-bone">
              {label}
            </span>
            <span className="block text-hud-sm text-hud-dim">{detail}</span>
          </button>
        ))}
      </div>
    </>
  );
}
