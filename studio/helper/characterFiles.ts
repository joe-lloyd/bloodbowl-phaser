import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseCatalog, parseCharacter, parseSpriteManifest, type Catalog, type CatalogField, type Character, type LayoutValue } from "../boundary/studio";
import { CHARACTERS, DRAFTS, FACTORY, MANIFEST, TREE_CHARACTERS } from "./paths";
import { run } from "./run";

const manifest = () => parseSpriteManifest(readFileSync(MANIFEST, "utf8"));

function readFolder(folder: string): Character[] {
  const files = existsSync(folder) ? readdirSync(folder).filter((name) => name.endsWith(".json")) : [];
  return files.sort().map((name) => parseCharacter(readFileSync(path.join(folder, name), "utf8")));
}

export function readCharacters(): Character[] {
  const saved = [TREE_CHARACTERS, CHARACTERS].flatMap(readFolder);
  return [...new Map(saved.map((character) => [character.key, character])).values()];
}

export function installedModels(): string[] {
  return Object.keys(manifest().models);
}

export function rosterPositions(): Record<string, string[]> {
  return Object.fromEntries(Object.entries(manifest().positions).map(([roster, positions]) => [roster, Object.keys(positions)]));
}

export async function readCatalog(): Promise<Catalog> {
  return parseCatalog(await run({ program: "python3", args: ["catalog.py", "--characters", CHARACTERS], cwd: FACTORY }));
}

export async function prepareReference(): Promise<void> {
  if (!existsSync(path.join(FACTORY, "reference/rosters.json"))) {
    await run({ program: "python3", args: ["make_reference.py"], cwd: FACTORY });
  }
}

function write(folder: string, character: Character): void {
  mkdirSync(folder, { recursive: true });
  writeFileSync(path.join(folder, `${character.key}.json`), `${JSON.stringify(character, null, 2)}\n`);
}

function valueProblem(value: LayoutValue, field: CatalogField | undefined): string | null {
  if (value === null) return field?.optional === false ? "always needs a value" : null;
  const fraction = typeof value === "number" && !Number.isInteger(value);
  return fraction && field?.kind === "number" && field.whole ? "needs a whole number" : null;
}

function checkFields(character: Character, catalog: Catalog): void {
  const choices = character.looks.kind === "own" ? character.looks.options.flatMap((option) => option.values) : [];
  const fields = new Map(catalog.fields.map((field) => [field.key, field]));
  const refuse = (key: string, reason: string) => {
    throw new Error(`${key} ${reason}`);
  };
  for (const layout of [character.layout, ...choices.map((choice) => choice.layout ?? {})]) {
    for (const [key, value] of Object.entries(layout)) {
      const problem = valueProblem(value, fields.get(key));
      if (problem) refuse(key, problem);
    }
  }
  for (const key of choices.flatMap((choice) => Object.keys(choice.layout ?? {}))) {
    if (fields.get(key)?.layered === false) refuse(key, "changes the body, so set it on the character and not in a look option");
  }
}

export function checkCharacter(character: Character, catalog: Catalog): void {
  const base = catalog.models.find((model) => model.key === character.base);
  if (!base || base.character) throw new Error(`${character.base} is not a model a character can start from`);
  if (!catalog.races.some((race) => race.key === character.race)) throw new Error(`Unknown race ${character.race}`);
  checkFields(character, catalog);
  const inherited = character.looks.kind === "base" ? base.lookKeys : [];
  if (character.parts === "drop" && inherited.some((key) => base.ownKeys.includes(key))) {
    throw new Error("The base's look options use parts made for it. Keep those parts or set your own options.");
  }
  const taken = catalog.models.some((model) => model.key === character.key && !model.character);
  const isCharacter = readCharacters().some((saved) => saved.key === character.key);
  if (taken || (!isCharacter && installedModels().includes(character.key))) {
    throw new Error(`${character.key} is already a model`);
  }
}

export function writeCharacter(character: Character): void {
  write(CHARACTERS, character);
}

export function writeDraft(character: Character): void {
  rmSync(DRAFTS, { recursive: true, force: true });
  write(DRAFTS, character);
}
