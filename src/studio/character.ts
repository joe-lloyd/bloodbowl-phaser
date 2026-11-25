import type { BaseModel, Catalog, CatalogField, Character, LayoutValue, LayoutValues } from "../boundary/characterStudio";

export type Change = (patch: Partial<Character>) => void;

export function findBase(catalog: Catalog, character: Character): BaseModel | undefined {
  return catalog.models.find((model) => model.key === character.base);
}

export function startFrom(base: BaseModel, key: string, label: string): Character {
  return {
    key,
    label,
    base: base.key,
    race: base.race,
    sex: base.sex,
    height: base.height,
    parts: "keep",
    knobs: {},
    layout: {},
    stance: {},
    motion: {},
    looks: { kind: "base" },
    usedBy: [],
  };
}

export function replaceAt<Value>(list: readonly Value[], index: number, value: Value): Value[] {
  return list.map((entry, at) => (at === index ? value : entry));
}

export function removeAt<Value>(list: readonly Value[], index: number): Value[] {
  return list.filter((_, at) => at !== index);
}

export function slug(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^[_0-9]+|_+$/g, "");
}

export function words(key: string): string {
  const text = key.replace(/_/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function withoutKey<Value>(record: Readonly<Record<string, Value>>, key: string): Record<string, Value> {
  return Object.fromEntries(Object.entries(record).filter(([name]) => name !== key));
}

export function inheritedLayout(catalog: Catalog, character: Character): LayoutValues {
  const race = catalog.races.find((entry) => entry.key === character.race);
  return { ...race?.layout, ...findBase(catalog, character)?.layout };
}

export function controlledKeys(catalog: Catalog, character: Character): ReadonlySet<string> {
  if (character.looks.kind === "base") return new Set(findBase(catalog, character)?.lookKeys);
  const layouts = character.looks.options.flatMap((option) => option.values.map((value) => value.layout ?? {}));
  return new Set(layouts.flatMap((layout) => Object.keys(layout)));
}

export function buildIsChosenByLooks(catalog: Catalog, character: Character): boolean {
  const { looks } = character;
  const bodies = looks.kind === "own" ? looks.bodies : (findBase(catalog, character)?.bodies.map(([value]) => value) ?? []);
  return bodies.length > 0 && !bodies.includes("x");
}

export function usableFields(catalog: Catalog, character: Character): CatalogField[] {
  const own = new Set(character.parts === "keep" ? findBase(catalog, character)?.ownKeys : []);
  return catalog.fields.filter((field) => field.generic || own.has(field.key));
}

export function inheritedKnob(catalog: Catalog, character: Character, knob: string): number | boolean {
  const race = catalog.races.find((entry) => entry.key === character.race);
  const neutral = ["hunch", "head_fwd"].includes(knob) ? 0 : 1;
  return findBase(catalog, character)?.knobs[knob] ?? race?.knobs[knob] ?? (knob === "digi" ? false : neutral);
}

export function firstValue(field: CatalogField): LayoutValue {
  switch (field.kind) {
    case "toggle":
      return true;
    case "number":
      return 1;
    case "material":
      return "kit1";
    case "choice":
      return field.values[0] ?? null;
  }
}
