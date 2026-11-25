import type { Catalog, Character } from "../boundary/characterStudio";
import { Input, Select } from "../ui/components/common/NativeControls";
import { Field, Section } from "../ui/components/componentWarehouse/HudKit";
import { findBase, inheritedKnob, withoutKey, words, type Change } from "./character";
import { NumberRow } from "./NumberRows";

interface EditorProps {
  readonly catalog: Catalog;
  readonly character: Character;
  readonly onChange: Change;
}

const FACTOR = { min: 0.4, max: 2, step: 0.01 };
const RANGES: Readonly<Record<string, typeof FACTOR>> = {
  hunch: { min: 0, max: 40, step: 1 },
  head_fwd: { min: 0, max: 0.2, step: 0.01 },
  stride: { min: 10, max: 60, step: 1 },
  arm_swing: { min: 0, max: 60, step: 1 },
  run_lean: { min: -10, max: 40, step: 1 },
  jump: { min: 0, max: 0.6, step: 0.01 },
  lean: { min: -20, max: 40, step: 1 },
  twist: { min: -30, max: 30, step: 1 },
  nod: { min: -30, max: 30, step: 1 },
};
const KNOB_LABELS: Readonly<Record<string, string>> = {
  legs: "Leg length",
  arms: "Arm length",
  limb: "Limb thickness",
  arm: "Arm thickness",
  shoulders: "Shoulder width",
  torso: "Torso bulk",
  torso_len: "Torso length",
  head: "Head size",
  hands: "Hand size",
  feet: "Foot size",
  hips: "Hip width",
  neck: "Neck thickness",
  head_fwd: "Head forward",
};
const SEXES = [
  { value: "m", label: "Male build" },
  { value: "f", label: "Female build" },
  { value: "x", label: "Own build" },
] as const;
const HANDS = ["fist", "relaxed", "open"];

function rangeOf(name: string): typeof FACTOR {
  return RANGES[name] ?? FACTOR;
}

export function BasicsEditor({ catalog, character, onChange }: EditorProps) {
  const base = findBase(catalog, character);
  return (
    <Section title="Character" aside={`Starts from ${words(character.base)}`} bodyClassName="grid grid-cols-2 gap-3">
      <Field label="Name">
        <Input className="hud-field" value={character.label} maxLength={60} onChange={(event) => { onChange({ label: event.target.value }); }} />
      </Field>
      <Field label="Race proportions">
        <Select className="hud-field" value={character.race} onChange={(event) => { onChange({ race: event.target.value }); }}>
          {catalog.races.map((race) => <option key={race.key} value={race.key}>{words(race.key)}</option>)}
        </Select>
      </Field>
      <Field label="Build">
        <Select
          className="hud-field"
          value={character.sex}
          onChange={(event) => { onChange({ sex: SEXES.find(({ value }) => value === event.target.value)?.value ?? "x" }); }}
        >
          {SEXES.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
        </Select>
      </Field>
      <Field label="Parts made for this base" hint={base?.doc}>
        <Select className="hud-field" value={character.parts} onChange={(event) => { onChange({ parts: event.target.value === "drop" ? "drop" : "keep" }); }}>
          <option value="keep">Keep</option>
          <option value="drop">Leave out</option>
        </Select>
      </Field>
      <div className="col-span-2">
        <NumberRow
          name="height"
          value={character.height}
          range={{ min: 0.5, max: 1.6, step: 0.01 }}
          changed={base !== undefined && character.height !== base.height}
          onChange={(height) => { onChange({ height }); }}
          onReset={() => { if (base) onChange({ height: base.height }); }}
        />
      </div>
    </Section>
  );
}

export function BuildEditor({ catalog, character, onChange }: EditorProps) {
  const { knobs } = character;
  return (
    <Section title="Build">
      {catalog.knobs.filter((knob) => knob !== "digi").map((knob) => (
        <NumberRow
          key={knob}
          name={KNOB_LABELS[knob] ?? knob}
          value={Number(knobs[knob] ?? inheritedKnob(catalog, character, knob))}
          range={rangeOf(knob)}
          changed={knob in knobs}
          onChange={(value) => { onChange({ knobs: { ...knobs, [knob]: value } }); }}
          onReset={() => { onChange({ knobs: withoutKey(knobs, knob) }); }}
        />
      ))}
      <label className="flex min-h-[36px] items-center gap-2 text-hud-sm text-hud-dim">
        <Input
          type="checkbox"
          checked={Boolean(knobs["digi"] ?? inheritedKnob(catalog, character, "digi"))}
          onChange={(event) => { onChange({ knobs: { ...knobs, digi: event.target.checked } }); }}
        />
        Animal legs
      </label>
    </Section>
  );
}

export function MotionEditor({ catalog, character, onChange }: EditorProps) {
  const base = findBase(catalog, character);
  const { stance, motion } = character;
  return (
    <Section title="Stance and motion">
      {["lean", "twist", "nod"].map((name) => (
        <NumberRow
          key={name}
          name={name}
          value={Number(stance[name] ?? base?.stance[name] ?? 0)}
          range={rangeOf(name)}
          changed={name in stance}
          onChange={(value) => { onChange({ stance: { ...stance, [name]: value } }); }}
          onReset={() => { onChange({ stance: withoutKey(stance, name) }); }}
        />
      ))}
      <Field label="Hands" className="my-2">
        <Select
          className="hud-field"
          value={stance["hands"] ?? base?.stance["hands"] ?? "relaxed"}
          onChange={(event) => { onChange({ stance: { ...stance, hands: event.target.value } }); }}
        >
          {HANDS.map((hands) => <option key={hands} value={hands}>{words(hands)}</option>)}
        </Select>
      </Field>
      {Object.entries(base?.motion ?? {}).map(([name, value]) => (
        <NumberRow
          key={name}
          name={name}
          value={motion[name] ?? value}
          range={rangeOf(name)}
          changed={name in motion}
          onChange={(next) => { onChange({ motion: { ...motion, [name]: next } }); }}
          onReset={() => { onChange({ motion: withoutKey(motion, name) }); }}
        />
      ))}
    </Section>
  );
}
