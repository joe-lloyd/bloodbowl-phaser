import { useState } from "react";
import type { Catalog, Character } from "../boundary/studio";
import { Input, Select } from "../../src/ui/components/common/NativeControls";
import { HudButton } from "../../src/ui/components/componentWarehouse/HudButton";
import { Field, Section } from "../../src/ui/components/componentWarehouse/HudKit";
import { slug, startFrom, words } from "./character";

interface NewCharacterProps {
  readonly catalog: Catalog;
  readonly taken: readonly string[];
  readonly onCreate: (character: Character) => void;
}

export function NewCharacter({ catalog, taken, onCreate }: NewCharacterProps) {
  const bases = catalog.models.filter((model) => !model.character);
  const [name, setName] = useState("");
  const [baseKey, setBaseKey] = useState(bases[0]?.key ?? "");
  const base = bases.find((model) => model.key === baseKey);
  const key = slug(name);
  const isTaken = taken.includes(key);
  return (
    <Section title="New character">
      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (base && key && !isTaken) onCreate(startFrom(base, key, name.trim()));
        }}
      >
        <Field label="Name" hint={isTaken ? `${key} is already a model` : undefined}>
          <Input className="hud-field" value={name} maxLength={40} onChange={(event) => { setName(event.target.value); }} />
        </Field>
        <Field label="Start from" hint={base?.doc}>
          <Select className="hud-field" value={baseKey} onChange={(event) => { setBaseKey(event.target.value); }}>
            {bases.map((model) => <option key={model.key} value={model.key}>{words(model.key)}</option>)}
          </Select>
        </Field>
        <HudButton type="submit" variant="gold" disabled={!key || isTaken}>Create</HudButton>
      </form>
    </Section>
  );
}
