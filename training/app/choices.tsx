import type { ReactNode } from "react";
import { Field } from "../../src/ui/components/componentWarehouse/HudPage";
import { Select } from "../../src/ui/components/common/NativeControls";

export function Choice<Value extends string>({
  label,
  value,
  options,
  onChange,
  children,
}: {
  label: string;
  value: Value;
  options: readonly { value: Value; label: string }[];
  onChange: (value: Value) => void;
  children?: ReactNode;
}) {
  return (
    <Field label={label} className="min-w-[10rem]">
      <Select
        className="hud-field"
        value={value}
        onChange={(event) => {
          const picked = options.find((o) => o.value === event.target.value);
          if (picked) onChange(picked.value);
        }}
      >
        {children}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Select>
    </Field>
  );
}
