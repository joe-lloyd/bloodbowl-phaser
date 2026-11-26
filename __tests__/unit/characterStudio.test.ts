import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { checkCharacter } from "../../studio/helper/characterFiles";
import { characterProblem, parseCatalog, type Character } from "../../studio/boundary/studio";

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
  for (const [index, character] of characters.entries()) {
    writeFileSync(path.join(folder, `${String(index)}.json`), JSON.stringify(character));
  }
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

  it("says which fields always need a value and which a look option can change", () => {
    const fields = new Map(catalogWith().fields.map((field) => [field.key, field]));
    const offered = (key: string) => [fields.get(key)?.optional, fields.get(key)?.layered];
    expect(offered("skin")).toEqual([false, true]);
    expect(offered("helm")).toEqual([true, true]);
    expect(offered("pothelm")).toEqual([true, true]);
    expect(offered("pad_mat")[0]).toBe(false);
    expect(offered("helm_mat")[0]).toBe(false);
    expect(offered("cuff")[0]).toBe(true);
    expect(offered("head")).toEqual([false, false]);
    expect(offered("hunch")).toEqual([false, false]);
    expect(offered("no_arms")[1]).toBe(false);
  });

  it("refuses a character with no skin or a look option that changes the body", () => {
    const catalog = catalogWith();
    const own = (layout: Character["layout"]): Character => ({
      ...RAIDER,
      looks: { kind: "own", bodies: ["m"], options: [{ name: "a", label: "A", values: [{ value: "b", label: "B", layout }] }] },
    });
    expect(() => { checkCharacter({ ...RAIDER, layout: { skin: null } }, catalog); }).toThrow("skin always needs a value");
    expect(() => { checkCharacter(own({ skin: null }), catalog); }).toThrow("skin always needs a value");
    expect(() => { checkCharacter(own({ head: "skull" }), catalog); }).toThrow("head changes the body");
    expect(() => { checkCharacter(own({ helm: "open", skin: "skin_orc" }), catalog); }).not.toThrow();
  });

  it("refuses inherited look options whose parts are left out", () => {
    const character: Character = { ...RAIDER, parts: "drop", looks: { kind: "base" } };
    expect(() => { checkCharacter(character, catalogWith()); }).toThrow("Keep those parts or set your own options");
  });

  it("drops a saved character's look options when a later copy has none", () => {
    const plain = { ...RAIDER, base: "minotaur", race: "minotaur" };
    const catalog = catalogWith(plain, { ...plain, looks: { kind: "base" }, layout: { skin: "fur_white" } });
    const base = catalog.models.find((entry) => entry.key === "minotaur");
    const model = catalog.models.find((entry) => entry.key === "bog_raider");
    expect(base?.options).toEqual([]);
    expect(model?.options).toEqual([]);
    expect(model?.layout["skin"]).toBe("fur_white");
  });

  it("reports a character it cannot build and keeps the others", () => {
    const catalog = catalogWith({ ...RAIDER, base: "no_such_model" }, { ...RAIDER, key: "marsh_raider" });
    expect(Object.keys(catalog.errors)).toEqual(["0.json"]);
    expect(catalog.models.some((entry) => entry.key === "marsh_raider")).toBe(true);
  });

  it("offers none only for parts the drawing code can leave out", () => {
    const optional = new Map(catalogWith().fields.map((field) => [field.key, field.optional]));
    expect([optional.get("tank"), optional.get("breast"), optional.get("helm")]).toEqual([false, true, true]);
  });

  it("refuses a fraction where the drawing code counts", () => {
    const catalog = catalogWith({ ...RAIDER, layout: { bars: 2.05 } });
    expect(() => { checkCharacter({ ...RAIDER, layout: { bars: 2.05 } }, catalog); }).toThrow("bars needs a whole number");
    expect(() => { checkCharacter({ ...RAIDER, layout: { bars: 3, beard_len: 0.35 } }, catalog); }).not.toThrow();
  });

  it("will not replace a Python model", () => {
    expect(Object.keys(catalogWith({ ...RAIDER, key: "thrall" }).errors)).toEqual(["0.json"]);
  });
});

describe("character files", () => {
  it.each(["../thrall", "bog__raider", "Bog", "bog raider", "bog&dir"])("rejects the key %s", (key) => {
    expect(characterProblem({ ...RAIDER, key })).not.toBeNull();
  });

  it("rejects two look options that set the same part", () => {
    const helm = (name: string) => ({ name, label: name, values: [{ value: "a", label: "A", layout: { helm: "open" } }] });
    const problem = characterProblem({ ...RAIDER, looks: { kind: "own", bodies: ["m"], options: [helm("hat"), helm("head")] } });
    expect(problem).toContain("Two look options both set helm");
  });

  it("rejects a motion that is not a motion setting", () => {
    expect(characterProblem({ ...RAIDER, motion: { pose: 1 } })).toContain("Motion only has stride");
    expect(catalogWith({ ...RAIDER, motion: { pose: 1 } }).errors["0.json"]).toContain("unknown motion pose");
  });

  it("accepts a complete character", () => {
    expect(characterProblem(RAIDER)).toBeNull();
  });
});
