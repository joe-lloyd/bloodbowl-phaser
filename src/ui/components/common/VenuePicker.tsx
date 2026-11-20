import type { GameType } from "../../../game/variants/gameTypes";
import { gameTypeRules } from "../../../game/variants/gameTypeRules";
import type { Venue } from "../../../game/variants/pitchLayouts";
import { cx, hudChoiceClass } from "../componentWarehouse/HudKit";
import { choiceKeys } from "../componentWarehouse/choiceKeys";

const ROLL = "roll";

type Pick = Venue | typeof ROLL;

const PICKS: Partial<Record<Pick, { name: string; line: string }>> = {
  "gutter-street": {
    name: "Street",
    line: "Market stalls count as walls",
  },
  "gutter-sewer": {
    name: "Sewer",
    line: "A pushed player can fall into a pit",
  },
  [ROLL]: { name: "Roll a D6", line: "1-3 Sewer, 4-6 Street" },
};

export function VenuePicker({
  gameType,
  venue,
  onChange,
  disabled,
}: {
  gameType: GameType;
  venue: Venue | undefined;
  onChange: (venue: Venue | undefined) => void;
  disabled: boolean;
}) {
  const { venues } = gameTypeRules(gameType);
  if (venues.length < 2) return null;
  const ids: Pick[] = [...venues, ROLL];
  const value: Pick = venue && venues.includes(venue) ? venue : ROLL;
  const pick = (id: Pick) => {
    if (id !== value) onChange(id === ROLL ? undefined : id);
  };
  const keys = choiceKeys({ ids, value, onChange: pick });
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span className="hud-label">Pitch</span>
      <div
        role="radiogroup"
        aria-label="Pitch"
        className="grid grid-cols-3 gap-2"
      >
        {ids.map((id) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={value === id}
            disabled={disabled}
            {...keys(id)}
            onClick={() => {
              pick(id);
            }}
            className={cx(hudChoiceClass(value === id), "px-3 py-2 text-left")}
          >
            <span className="block font-hud-label text-hud-base font-bold uppercase tracking-[0.04em] text-hud-bone">
              {PICKS[id]?.name ?? id}
            </span>
            <span className="block text-hud-sm text-hud-dim">
              {PICKS[id]?.line}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
