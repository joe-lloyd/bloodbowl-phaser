import { describe, expect, it } from "vitest";
import { placeDice } from "../../src/ui/components/hud/dicePlacement";

const phone = { left: 8, top: 8, right: 836, bottom: 382 };
const box = { width: 220, height: 130 };
const blockDialog = { left: 536, top: 100, right: 836, bottom: 382 };
const topBar = { left: 8, top: 8, right: 836, bottom: 84 };
const players = [
  { left: 250, top: 190, right: 290, bottom: 240 },
  { left: 280, top: 200, right: 320, bottom: 250 },
];

function clearOf(spot: { left: number; top: number }, rects: typeof players) {
  return rects.every(
    (r) =>
      spot.left + box.width <= r.left ||
      spot.left >= r.right ||
      spot.top + box.height <= r.top ||
      spot.top >= r.bottom
  );
}

describe("where dice land on a phone", () => {
  it("keeps clear of the block dialog, the score and both players", () => {
    const spot = placeDice({
      box,
      bounds: phone,
      prompts: [blockDialog, topBar],
      action: players,
      current: null,
    });
    expect(clearOf(spot, [blockDialog, topBar, ...players])).toBe(true);
  });

  it("stays where it is while nothing comes over it", () => {
    const current = { left: 8, top: 232 };
    expect(
      placeDice({ box, bounds: phone, prompts: [blockDialog], action: players, current })
    ).toEqual(current);
  });

  it("moves off a prompt that opens over it", () => {
    const spot = placeDice({
      box,
      bounds: phone,
      prompts: [blockDialog, topBar],
      action: players,
      current: { left: 580, top: 200 },
    });
    expect(clearOf(spot, [blockDialog])).toBe(true);
  });

  it("covers a player before it covers a prompt when nothing is free", () => {
    const spot = placeDice({
      box: { width: 220, height: 374 },
      bounds: phone,
      prompts: [blockDialog],
      action: players,
      current: null,
    });
    expect(spot.left + box.width).toBeLessThanOrEqual(blockDialog.left);
  });
});
