import {
  DEFAULT_SEVENS_RULESET,
  NAF_SEVENS_RULESET,
  readSevensRuleset,
  SEVENS_RULESET_LABELS,
  type SevensRuleset,
} from "../../../game/rules/sevensRuleset";
import { Field } from "../componentWarehouse/HudKit";

const RULESET_CHOICES: readonly SevensRuleset[] = [
  DEFAULT_SEVENS_RULESET,
  NAF_SEVENS_RULESET,
];

export function SevensRulesetSelector({
  value = DEFAULT_SEVENS_RULESET,
  onChange,
  disabled = false,
}: {
  value?: SevensRuleset;
  onChange: (ruleset: SevensRuleset) => void;
  disabled?: boolean;
}) {
  return (
    <Field label="Sevens rules">
      <select
        aria-label="Sevens rules"
        value={value}
        onChange={(event) => {
          onChange(readSevensRuleset(event.target.value));
        }}
        disabled={disabled}
        className="hud-field"
      >
        {RULESET_CHOICES.map((ruleset) => (
          <option key={ruleset} value={ruleset}>
            {SEVENS_RULESET_LABELS[ruleset]}
          </option>
        ))}
      </select>
      <span className="mt-2 block font-hud-body text-hud-sm text-hud-dim">
        Both use GW rules and NAF clarifications, including Swarming. The
        optional NAF rulings ignore Insignificant when drafting a roster.
      </span>
    </Field>
  );
}
