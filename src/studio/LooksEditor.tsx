import type { Catalog, Character, OwnOption } from "../boundary/characterStudio";
import { Input, Select } from "../ui/components/common/NativeControls";
import { HudButton } from "../ui/components/componentWarehouse/HudButton";
import { Field, Section } from "../ui/components/componentWarehouse/HudKit";
import { findBase, removeAt, replaceAt, slug, usableFields, type Change } from "./character";
import { FieldRows } from "./FieldRows";

interface LooksEditorProps {
  readonly catalog: Catalog;
  readonly character: Character;
  readonly onChange: Change;
}

type OwnLooks = Extract<Character["looks"], { kind: "own" }>;
const NOTHING_LOCKED: ReadonlySet<string> = new Set();
const BODIES = [
  { value: "m", label: "Male" },
  { value: "f", label: "Female" },
  { value: "x", label: "Own build" },
] as const;

const NEW_VALUE = { value: "new", label: "New", layout: {} };

function freeName(label: string, taken: readonly string[], fallback: string): string {
  const name = slug(label) || fallback;
  if (!taken.includes(name) && name !== "body") return name;
  return freeName(`${name}_2`, taken, fallback);
}

interface OptionEditorProps extends LooksEditorProps {
  readonly option: OwnOption;
  readonly onOption: (option: OwnOption | null) => void;
}

function ValueEditor({ index, ...props }: OptionEditorProps & { readonly index: number }) {
  const { option, onOption, catalog, character } = props;
  const value = option.values[index];
  if (!value) return null;
  const put = (next: typeof value) => { onOption({ ...option, values: replaceAt(option.values, index, next) }); };
  const others = option.values.filter((_, at) => at !== index).map((other) => other.value);
  return (
    <div className="border-l border-hud-edge pl-3">
      <div className="mb-1 flex items-center gap-2">
        <Input
          aria-label={`${option.label} choice ${String(index + 1)}`}
          className="hud-field"
          value={value.label}
          onChange={(event) => { put({ ...value, label: event.target.value, value: freeName(event.target.value, others, "choice") }); }}
        />
        {index === 0 && <span className="text-hud-2xs text-hud-mute">Default</span>}
        <HudButton size="xs" variant="danger" disabled={option.values.length === 1} onClick={() => { onOption({ ...option, values: removeAt(option.values, index) }); }}>
          Remove
        </HudButton>
      </div>
      <FieldRows
        catalog={catalog}
        fields={usableFields(catalog, character).filter((field) => field.layered)}
        inherited={{}}
        layout={value.layout ?? {}}
        locked={NOTHING_LOCKED}
        onChange={(layout) => { put({ ...value, layout }); }}
      />
    </div>
  );
}

function OptionEditor(props: OptionEditorProps) {
  const { option, onOption, character } = props;
  const taken = character.looks.kind === "own" ? character.looks.options.filter((other) => other !== option).map((other) => other.name) : [];
  return (
    <div className="mb-4 flex flex-col gap-3 rounded-hud border border-white/10 p-3">
      <div className="flex items-center gap-2">
        <Input
          aria-label="Option name"
          className="hud-field"
          value={option.label}
          onChange={(event) => { onOption({ ...option, label: event.target.value, name: freeName(event.target.value, taken, "option") }); }}
        />
        <HudButton size="xs" variant="danger" onClick={() => { onOption(null); }}>Remove</HudButton>
      </div>
      {option.values.map((_, index) => <ValueEditor key={index} {...props} index={index} />)}
      <HudButton
        size="sm"
        variant="ghost"
        onClick={() => {
          const value = freeName("new", option.values.map((entry) => entry.value), "choice");
          onOption({ ...option, values: [...option.values, { ...NEW_VALUE, value }] });
        }}
      >
        Add a choice
      </HudButton>
    </div>
  );
}

function OwnLooksEditor({ looks, ...props }: LooksEditorProps & { readonly looks: OwnLooks }) {
  const put = (options: OwnOption[]) => { props.onChange({ looks: { ...looks, options } }); };
  const add = () => {
    const name = freeName("option", looks.options.map((option) => option.name), "option");
    put([...looks.options, { name, label: "Option", values: [NEW_VALUE] }]);
  };
  return (
    <>
      <div className="mb-3 flex flex-wrap gap-4">
        {BODIES.map(({ value, label }) => (
          <label key={value} className="flex min-h-[32px] items-center gap-2 text-hud-sm">
            <Input
              type="checkbox"
              checked={looks.bodies.includes(value)}
              onChange={(event) => {
                const bodies = BODIES.map((entry) => entry.value).filter((entry) => (entry === value ? event.target.checked : looks.bodies.includes(entry)));
                if (bodies.length > 0) props.onChange({ looks: { ...looks, bodies } });
              }}
            />
            {label}
          </label>
        ))}
      </div>
      {looks.options.map((option, index) => (
        <OptionEditor
          key={index}
          {...props}
          option={option}
          onOption={(next) => { put(next ? replaceAt(looks.options, index, next) : removeAt(looks.options, index)); }}
        />
      ))}
      <HudButton size="sm" onClick={add}>Add a look option</HudButton>
    </>
  );
}

export function LooksEditor(props: LooksEditorProps) {
  const { catalog, character, onChange } = props;
  const base = findBase(catalog, character);
  const inherited = base?.options.map((option) => `${option.label}: ${option.values.map((value) => value.label).join(", ")}`) ?? [];
  return (
    <Section title="Look options">
      <Field label="Choices a coach gets">
        <Select
          className="hud-field mb-3"
          value={character.looks.kind}
          onChange={(event) => {
            onChange({ looks: event.target.value === "own" ? { kind: "own", bodies: [character.sex], options: [] } : { kind: "base" } });
          }}
        >
          <option value="base">Keep the base model's options</option>
          <option value="own">Set my own</option>
        </Select>
      </Field>
      {character.looks.kind === "own" ? (
        <OwnLooksEditor {...props} looks={character.looks} />
      ) : (
        inherited.map((line) => <p key={line} className="text-hud-sm text-hud-dim">{line}</p>)
      )}
    </Section>
  );
}
