import { useId } from "react";
import type { Catalog, CatalogField, LayoutValue, LayoutValues } from "../boundary/characterStudio";
import { Input, Select } from "../ui/components/common/NativeControls";
import { HudButton } from "../ui/components/componentWarehouse/HudButton";
import { firstValue, withoutKey, words } from "./character";

const NONE = "";
const ON = "on";
const KITS: Readonly<Record<string, readonly string[]>> = { kit1: ["#2a4ac8"], kit2: ["#e8e8e8"] };

interface ControlProps {
  readonly id: string;
  readonly field: CatalogField;
  readonly value: LayoutValue;
  readonly catalog: Catalog;
  readonly disabled: boolean;
  readonly onChange: (value: LayoutValue) => void;
}

function optionsOf(field: CatalogField, catalog: Catalog, value: LayoutValue): string[] {
  const listed = field.kind === "choice" ? field.values : catalog.materials.map((material) => material.key);
  return typeof value === "string" && !listed.includes(value) ? [value, ...listed] : [...listed];
}

function selected(value: LayoutValue): string {
  if (value === true) return ON;
  return typeof value === "string" ? value : NONE;
}

function Swatch({ catalog, material }: { readonly catalog: Catalog; readonly material: LayoutValue }) {
  if (typeof material !== "string") return <span className="w-9" />;
  const colors = KITS[material] ?? catalog.materials.find((entry) => entry.key === material)?.colors ?? [];
  return (
    <span className="flex h-6 w-9 shrink-0 overflow-hidden rounded-hud border border-white/20" aria-hidden>
      {colors.map((color, index) => (
        <span key={index} className="flex-1" style={{ background: color }} />
      ))}
    </span>
  );
}

function FieldControl({ id, field, value, catalog, disabled, onChange }: ControlProps) {
  if (field.kind === "toggle") {
    return <Input id={id} type="checkbox" checked={value === true} disabled={disabled} onChange={(event) => { onChange(event.target.checked); }} />;
  }
  if (field.kind === "number") {
    return (
      <Input
        id={id}
        type="number"
        step="0.05"
        className="hud-field"
        value={typeof value === "number" ? value : 0}
        disabled={disabled}
        onChange={(event) => { onChange(Number(event.target.value)); }}
      />
    );
  }
  return (
    <div className="flex min-w-0 items-center gap-2">
      {field.kind === "material" && <Swatch catalog={catalog} material={value} />}
      <Select
        id={id}
        className="hud-field min-w-0"
        value={selected(value)}
        disabled={disabled}
        onChange={(event) => { onChange(event.target.value === NONE ? null : event.target.value); }}
      >
        <option value={NONE}>None</option>
        {value === true && <option value={ON}>On</option>}
        {optionsOf(field, catalog, value).map((name) => (
          <option key={name} value={name}>{words(name)}</option>
        ))}
      </Select>
    </div>
  );
}

interface FieldRowsProps {
  readonly catalog: Catalog;
  readonly fields: readonly CatalogField[];
  readonly inherited: LayoutValues;
  readonly layout: LayoutValues;
  readonly locked: ReadonlySet<string>;
  readonly onChange: (layout: LayoutValues) => void;
}

interface RowProps extends FieldRowsProps {
  readonly field: CatalogField;
}

function FieldRow({ catalog, field, inherited, layout, locked, onChange }: RowProps) {
  const id = useId();
  const changed = field.key in layout;
  const isLocked = locked.has(field.key);
  const value = layout[field.key] ?? (changed ? null : inherited[field.key]) ?? null;
  return (
    <div className="grid min-h-[40px] grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_64px] items-center gap-2" data-field={field.key}>
      <label htmlFor={id} className={changed ? "text-hud-sm text-hud-gold" : "text-hud-sm text-hud-dim"}>{words(field.key)}</label>
      <FieldControl
        id={id}
        field={field}
        value={value}
        catalog={catalog}
        disabled={isLocked}
        onChange={(next) => { onChange({ ...layout, [field.key]: next }); }}
      />
      {isLocked && !changed && <span className="text-hud-2xs text-hud-mute">Look option</span>}
      {changed && (
        <HudButton size="xs" variant="ghost" aria-label={`Reset ${words(field.key)}`} onClick={() => { onChange(withoutKey(layout, field.key)); }}>
          Reset
        </HudButton>
      )}
    </div>
  );
}

function shown(field: CatalogField, { inherited, layout }: FieldRowsProps): boolean {
  const base = inherited[field.key];
  return field.key in layout || (base !== undefined && base !== null && base !== false);
}

export function FieldRows(props: FieldRowsProps) {
  const visible = props.fields.filter((field) => shown(field, props));
  const hidden = props.fields.filter((field) => !shown(field, props) && !props.locked.has(field.key));
  return (
    <div className="flex flex-col gap-1">
      {visible.map((field) => (
        <FieldRow key={field.key} {...props} field={field} />
      ))}
      <Select
        aria-label="Add a part or colour"
        className="hud-field mt-2"
        value={NONE}
        onChange={(event) => {
          const field = hidden.find((entry) => entry.key === event.target.value);
          if (field) props.onChange({ ...props.layout, [field.key]: firstValue(field) });
        }}
      >
        <option value={NONE}>Add a part or colour</option>
        {hidden.map((field) => (
          <option key={field.key} value={field.key}>{words(field.key)}</option>
        ))}
      </Select>
    </div>
  );
}
