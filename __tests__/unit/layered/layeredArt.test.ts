import { describe, expect, it } from "vitest";
import { parseLayeredModels } from "../../../src/boundary/layeredArt";

const palette = {
  colors: ["#000000"],
  keep: [],
  darker: [],
  rampDark: [],
  outline: 0,
  void: 0,
  kit: { kit1: [], kit2: [] },
};

function model(options: unknown) {
  return {
    frame: 64,
    anchor: [32, 60],
    animations: { idle: 4 },
    layered: { density: 2, options, bodies: { m: ["base"] }, palette },
  };
}

const body = ["body", "Body", [["m", "Male"]]];
const hair = ["hair", "Hair", [["short", "Short"]]];

describe("parseLayeredModels", () => {
  it("keeps layered models and skips flat ones", () => {
    const found = parseLayeredModels({ models: { flat: { frame: 64 }, thrall: model([body, hair]) } });
    expect([...found.keys()]).toEqual(["thrall"]);
  });

  it("names the model whose layered block is malformed", () => {
    const broken = { ...model([body]), layered: { density: 2 } };
    expect(() => parseLayeredModels({ models: { broken } })).toThrow(/Sprite model broken has a malformed layered block/);
  });

  it("rejects options that do not start with the body", () => {
    expect(() => parseLayeredModels({ models: { thrall: model([hair, body]) } })).toThrow(/The first look option must be "body"/);
  });
});
