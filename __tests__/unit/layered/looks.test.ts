import { describe, expect, it } from "vitest";
import type { LayeredModel } from "../../../src/boundary/layeredArt";
import { randomAppearance, resolveLook, seededRandom } from "../../../src/game/presentation/layered/looks";

const art: LayeredModel = {
  frame: 256,
  anchor: [128, 155],
  animations: { idle: 8 },
  layered: {
    density: 2,
    options: [
      ["body", "Body", [["m", "Male"], ["f", "Female"]]],
      ["cape", "Cape", [["short", "Short cape"], ["long", "Long cape"], ["none", "No cape"]]],
    ],
    bodies: {
      m: ["base", "cape.long", "cape.long~shade", "cape.short", "cape.short~shade"],
      f: ["base", "cape.long", "cape.short"],
    },
    palette: { colors: ["#000000"], keep: [], darker: [0], rampDark: [0], outline: 0, void: 0, kit: { kit1: [], kit2: [] } },
  },
};

describe("resolveLook", () => {
  it("uses each option's first value when nothing is stored", () => {
    expect(resolveLook(art, undefined)).toEqual({
      body: "m",
      layers: ["base", "cape.short"],
      shades: ["cape.short~shade"],
      choice: { body: "m", cape: "short" },
    });
  });

  it("draws nothing for a value without a layer and keeps shades only where they exist", () => {
    expect(resolveLook(art, { body: "f", cape: "none" }).layers).toEqual(["base"]);
    expect(resolveLook(art, { body: "f", cape: "long" })).toMatchObject({ layers: ["base", "cape.long"], shades: [] });
  });

  it("falls back to the defaults for values the model does not have", () => {
    expect(resolveLook(art, { body: "x", cape: "golden" }).choice).toEqual({ body: "m", cape: "short" });
  });
});

describe("appearance rolls", () => {
  it("are repeatable for one seed and pick only listed values", () => {
    const first = randomAppearance(art.layered.options, seededRandom("team-1-player-3"));
    expect(randomAppearance(art.layered.options, seededRandom("team-1-player-3"))).toEqual(first);
    expect(["m", "f"]).toContain(first["body"]);
    expect(["short", "long", "none"]).toContain(first["cape"]);
  });
});
