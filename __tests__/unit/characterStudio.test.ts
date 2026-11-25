import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { characterProblem, parseCatalog, type Character } from "../../src/boundary/characterStudio";

const RAIDER: Character = {
  key: "bog_raider",
  label: "Bog Raider",
  base: "goblin_lineman",
  race: "orc",
  sex: "m",
  height: 1.1,
  parts: "keep",
  knobs: { legs: 0.9 },
  layout: { skin: "skin_troll", topknot: null },
  stance: {},
  motion: { stride: 30 },
  looks: {
    kind: "own",
    bodies: ["m", "f"],
    options: [
      {
        name: "head",
        label: "Head",
        values: [
          { value: "tin_hat", label: "Tin hat", layout: { helm: "kettle" } },
          { value: "bare", label: "Bare", layout: null },
        ],
      },
    ],
  },
  usedBy: [],
};

function catalogWith(...characters: readonly object[]) {
  const folder = mkdtempSync(path.join(tmpdir(), "characters-"));
  characters.forEach((character, index) => {
    writeFileSync(path.join(folder, `${String(index)}.json`), JSON.stringify(character));
  });
  return parseCatalog(execFileSync("python3", ["scripts/sprites/factory/catalog.py", "--characters", folder], { encoding: "utf8" }));
}

describe("character studio catalogue", () => {
  it("registers a JSON character over its base model", () => {
    const catalog = catalogWith(RAIDER);
    expect(catalog.errors).toEqual({});
    const model = catalog.models.find((entry) => entry.key === "bog_raider");
    expect(model).toMatchObject({ character: true, race: "orc", height: 1.1, knobs: { legs: 0.9 } });
    expect(model?.layout).toMatchObject({ skin: "skin_troll", topknot: null, torso: "kit1" });
    expect(model?.motion).toMatchObject({ stride: 30, jump: 0.24 });
    expect(model?.bodies).toEqual([["m", "Male"], ["f", "Female"]]);
    expect(model?.lookKeys).toEqual(["helm"]);
  });

  it("keeps the base model's look options when asked to", () => {
    const catalog = catalogWith({ ...RAIDER, looks: { kind: "base" } });
    const model = catalog.models.find((entry) => entry.key === "bog_raider");
    expect(model?.options.map((option) => option.name)).toEqual(["head", "pads"]);
  });

  it("reports a character it cannot build and keeps the others", () => {
    const catalog = catalogWith({ ...RAIDER, base: "no_such_model" }, { ...RAIDER, key: "marsh_raider" });
    expect(Object.keys(catalog.errors)).toEqual(["0.json"]);
    expect(catalog.models.some((entry) => entry.key === "marsh_raider")).toBe(true);
  });

  it("will not replace a Python model", () => {
    expect(Object.keys(catalogWith({ ...RAIDER, key: "thrall" }).errors)).toEqual(["0.json"]);
  });
});

describe("character files", () => {
  it.each(["../thrall", "bog__raider", "Bog", "bog raider", "bog&dir"])("rejects the key %s", (key) => {
    expect(characterProblem({ ...RAIDER, key })).not.toBeNull();
  });

  it("accepts a complete character", () => {
    expect(characterProblem(RAIDER)).toBeNull();
  });
});
