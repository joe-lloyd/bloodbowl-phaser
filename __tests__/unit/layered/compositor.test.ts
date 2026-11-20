import { readFileSync, existsSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { parseLayeredModels, type LayerData } from "../../../src/boundary/layeredArt";
import { parseJson } from "../../../src/boundary/json";
import { composeFrame } from "../../../src/game/presentation/layered/compose";
import { finishFrame } from "../../../src/game/presentation/layered/finish";
import { layeredArt } from "../../../src/game/presentation/layered/layeredModels";
import { buildLookAtlas } from "../../../src/game/presentation/layered/lookAtlas";
import { resolveLook } from "../../../src/game/presentation/layered/looks";
import { colourTable, rampTint } from "../../../src/game/presentation/layered/paint";
import manifest from "../../../src/game/presentation/spriteManifest.json";

const rect = z.tuple([z.number(), z.number(), z.number(), z.number(), z.number()]);
const layerIndex = z.object({ frames: z.record(z.string(), rect), pixels: z.number() });
const golden = z.object({ frame: z.string(), layers: z.array(z.string()), rle: z.array(z.tuple([z.number(), z.number()])) });
const goldens = z.record(z.string(), golden);

function readLayer(model: string, body: string, name: string): LayerData {
  const base = `public/sprites/bloodbowl/${model}/layered/${body}/${name}`;
  const meta = parseJson(readFileSync(`${base}.json`, "utf8"), layerIndex);
  return { frames: meta.frames, pixels: meta.pixels, planes: new Uint8Array(inflateSync(readFileSync(`${base}.bin`))) };
}

function expand(rle: readonly (readonly [number, number])[]): number[] {
  return rle.flatMap(([value, count]) => Array.from({ length: count }, () => value));
}

const MODELS = [...parseLayeredModels(manifest).keys()];

describe("the game's compositor matches the sprite factory", () => {
  for (const model of MODELS) {
    const path = `__tests__/fixtures/layered/${model}.golden.json`;
    it(`rebuilds ${model}'s own look exactly`, () => {
      expect(existsSync(path), `${path} is missing`).toBe(true);
      const art = layeredArt(model);
      expect(art).toBeDefined();
      if (!art) return;
      for (const [body, expected] of Object.entries(parseJson(readFileSync(path, "utf8"), goldens))) {
        const layers = expected.layers.map((name) => readLayer(model, body, name));
        const shades = expected.layers.slice(1).filter((name) => art.layered.bodies[body]?.includes(`${name}~shade`))
          .map((name) => readLayer(model, body, `${name}~shade`));
        const done = finishFrame(composeFrame({ layers, shades }, expected.frame), art.layered.palette);
        const full = new Int16Array(art.frame * art.frame).fill(-1);
        for (let row = 0; row < done.height; row += 1) {
          full.set(done.pixels.subarray(row * done.width, (row + 1) * done.width), (done.y + row) * art.frame + done.x);
        }
        expect(Array.from(full)).toEqual(expand(expected.rle));
      }
    });
  }
});

describe("rampTint", () => {
  it("puts the team colour at the mid-light tone and keeps the dark tone clear of black", () => {
    expect(rampTint(0x8b0000, 0.78).map(Math.round)).toEqual([139, 0, 0]);
    const dark = rampTint(0x8b0000, 0.4375);
    expect(dark[0]).toBeGreaterThan(40);
  });
});

describe("colourTable", () => {
  const palette = {
    colors: ["#000000", "#102030", "#405060", "#708090", "#a0b0c0", "#d0e0f0"],
    keep: [],
    darker: [],
    rampDark: [],
    outline: 0,
    void: 0,
    kit: { kit1: [1, 2, 3], kit2: [4] },
  };
  const table = colourTable(palette, { primary: 0x8b0000, secondary: 0x00ff00 });
  const entry = (index: number) => Array.from(table.subarray(index * 4, index * 4 + 4));

  it("paints the kit indices with the team colour ramp", () => {
    expect(entry(1)).toEqual([86, 8, 22, 255]);
    expect(entry(2)).toEqual([127, 2, 6, 255]);
    expect(entry(3)).toEqual([183, 90, 82, 255]);
    expect(entry(4)).toEqual([15, 137, 22, 255]);
  });

  it("keeps every other index at its palette colour", () => {
    expect(entry(0)).toEqual([0, 0, 0, 255]);
    expect(entry(5)).toEqual([208, 224, 240, 255]);
  });
});

describe("buildLookAtlas", () => {
  it("gives every requested frame a rect inside the atlas", () => {
    const art = layeredArt("thrall");
    expect(art).toBeDefined();
    if (!art) return;
    const look = resolveLook(art, undefined);
    const read = (name: string) => readLayer("thrall", look.body, name);
    const names = Object.entries(art.animations).flatMap(([anim, count]) =>
      ["s", "e", "n", "w"].flatMap((facing) => Array.from({ length: count }, (_, i) => `${anim}/${facing}/${String(i)}`))
    );
    const atlas = buildLookAtlas({
      look: { layers: look.layers.map(read), shades: look.shades.map(read) },
      names,
      size: art.frame,
      palette: art.layered.palette,
      colors: { primary: 0x8b0000, secondary: 0xffffff },
    });
    expect(atlas.width).toBe(4096);
    expect(Object.keys(atlas.frames).sort()).toEqual([...names].sort());
    const outside = Object.entries(atlas.frames).filter(([, r]) => r.x < 0 || r.y < 0 || r.x + r.w > atlas.width || r.y + r.h > atlas.height);
    expect(outside).toEqual([]);
    expect(atlas.pixels.length).toBe(atlas.width * atlas.height * 4);
  });
});
