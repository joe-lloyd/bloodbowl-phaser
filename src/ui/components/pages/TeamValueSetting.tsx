import type { ChangeEvent } from "react";
import type { LobbySettings } from "../../../firebase/lobby";
import {
  TEAM_VALUE_STEPS,
  type TeamValueRange,
} from "../../../social/teamValueRange";
import { Field } from "../componentWarehouse/HudKit";

type Bound = keyof TeamValueRange;

function withBound(range: TeamValueRange | undefined, bound: Bound, value: string): TeamValueRange {
  const picked = value === "" ? undefined : Number(value);
  const min = bound === "min" ? picked : range?.min;
  const max = bound === "max" ? picked : range?.max;
  return {
    ...(min === undefined ? {} : { min }),
    ...(max === undefined ? {} : { max }),
  };
}

function outOfOrder(range: TeamValueRange | undefined, bound: Bound, value: number): boolean {
  if (bound === "min") return range?.max !== undefined && value > range.max;
  return range?.min !== undefined && value < range.min;
}

function BoundSelect({
  label,
  bound,
  settings,
  readOnly,
  onChange,
}: {
  label: string;
  bound: Bound;
  settings: LobbySettings;
  readOnly: boolean;
  onChange: (settings: LobbySettings) => void;
}) {
  const range = settings.teamValue;
  return (
    <Field label={label}>
      <select
        disabled={readOnly}
        value={range?.[bound] ?? ""}
        onChange={(event: ChangeEvent<HTMLSelectElement>) => {
          onChange({ ...settings, teamValue: withBound(range, bound, event.target.value) });
        }}
        className="hud-field"
      >
        <option value="">Any</option>
        {TEAM_VALUE_STEPS.map((value) => (
          <option key={value} value={value} disabled={outOfOrder(range, bound, value)}>
            {value / 1000}k
          </option>
        ))}
      </select>
    </Field>
  );
}

export function TeamValueSetting(props: {
  settings: LobbySettings;
  readOnly: boolean;
  onChange: (settings: LobbySettings) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="grid gap-4 sm:grid-cols-2">
        <BoundSelect label="Lowest team value" bound="min" {...props} />
        <BoundSelect label="Highest team value" bound="max" {...props} />
      </div>
      <p className="font-hud-body text-hud-sm text-hud-dim">
        Both teams must fit inside this range. The house bot picks a computer
        team inside it.
      </p>
    </div>
  );
}
