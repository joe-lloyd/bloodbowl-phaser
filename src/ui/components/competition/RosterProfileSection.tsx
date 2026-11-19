import type { TeamAdvancementMode } from "../../../types/Team";
import { Field, Section } from "../componentWarehouse/HudKit";
import type { ProfileChoice } from "./profileChoice";

const ADVANCEMENT_MODES: readonly { id: TeamAdvancementMode; label: string }[] = [
  { id: "advanced-league", label: "Advanced League" },
  { id: "matched-play", label: "Matched Play" },
  { id: "sevens-skill-selection", label: "Sevens Skill Selection" },
];

export function RosterProfileSection({
  value,
  onChange,
}: {
  value: ProfileChoice;
  onChange: (value: ProfileChoice) => void;
}) {
  return (
    <Section title="Roster rule profile">
      <label className="flex items-start gap-3 font-hud-body text-hud-base text-hud-bone">
        <input
          type="checkbox"
          checked={value.enabled}
          onChange={(event) => {
            onChange({ ...value, enabled: event.target.checked });
          }}
          className="hud-check mt-0.5"
        />
        Require an advancement mode, draft budget, and roster rules for
        entrants (leave unchecked for an unrestricted legacy competition)
      </label>
      {value.enabled && (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Advancement mode">
            <select
              value={value.advancementMode}
              onChange={(event) => {
                const mode = ADVANCEMENT_MODES.find((option) => option.id === event.target.value);
                if (mode) onChange({ ...value, advancementMode: mode.id });
              }}
              className="hud-field"
            >
              {ADVANCEMENT_MODES.map((mode) => (
                <option key={mode.id} value={mode.id}>
                  {mode.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Draft budget (gold)">
            <input
              type="number"
              step={10000}
              value={value.draftBudget}
              onChange={(event) => {
                onChange({ ...value, draftBudget: Number(event.target.value) || 0 });
              }}
              className="hud-field"
            />
          </Field>
        </div>
      )}
    </Section>
  );
}
