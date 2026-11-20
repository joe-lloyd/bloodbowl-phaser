import { readFileSync, existsSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import type { LayerData } from "../../../src/boundary/layeredArt";
import { parseJson } from "../../../src/boundary/json";
import { composeFrame } from "../../../src/game/presentation/layered/compose";
import { finishFrame } from "../../../src/game/presentation/layered/finish";
import { layeredArt } from "../../../src/game/presentation/layered/layeredModels";
import { rampTint } from "../../../src/game/presentation/layered/paint";

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

const MODELS = ["thrall", "vampire_runner", "vampire_thrower", "vampire_blitzer", "vargheist"];

describe("the game's compositor matches the sprite factory", () => {
  for (const model of MODELS) {
    const path = `__tests__/fixtures/layered/${model}.golden.json`;
    it.runIf(existsSync(path))(`rebuilds ${model}'s own look exactly`, () => {
      const art = layeredArt(model);
      expect(art).toBeDefined();
      if (!art) return;
      for (const [body, expected] of Object.entries(parseJson(readFileSync(path, "utf8"), goldens))) {
        const layers = expected.layers.map((name) => readLayer(model, body, name));
        const shades = expected.layers.slice(1).filter((name) => art.layered.bodies[body]?.includes(`${name}~shade`))
          .map((name) => readLayer(model, body, `${name}~shade`));
        const finished = finishFrame(composeFrame({ layers, shades }, expected.frame, art.frame), art.layered.palette);
        expect(Array.from(finished)).toEqual(expand(expected.rle));
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
