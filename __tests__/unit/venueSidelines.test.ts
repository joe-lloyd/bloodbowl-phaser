import { describe, expect, it } from "vitest";
import meta from "../../public/stadium/bloodbowl/meta.json";
import { parseStadiumMeta } from "../../src/boundary/stadium";
import {
  dugoutGateX,
  venueDugouts,
} from "../../src/game/presentation/venueSidelines";
import { PITCH_LAYOUTS } from "../../src/game/variants/pitchLayouts";
import { obstacleBlocks } from "../../src/game/elements/venue/obstacles";
import {
  wallHitFromSquare,
  wallHitFromThrowIn,
} from "../../src/game/presentation/wallHits";
import { gameTypeLabel } from "../../src/ui/components/hud/matchStripText";

describe("venue dugouts", () => {
  it("reproduces the rendered stadium's dugout squares for a 20 × 11 pitch", () => {
    expect(venueDugouts({ cols: 20, rows: 11 })).toEqual(
      parseStadiumMeta(meta).dugouts
    );
  });

  it("centres the benches on a 26 × 7 street, one bench behind each wall", () => {
    const { home, away } = venueDugouts(PITCH_LAYOUTS.street);
    expect(home["sent off"]).toEqual([
      [2.5, -1.5],
      [2.5, -2.5],
      [2.5, -3.5],
    ]);
    expect(home.reserves[0]).toEqual([9.5, -1.5]);
    expect(away.reserves[0]).toEqual([13.5, 8.5]);
    expect(away["sent off"]).toEqual([
      [23.5, 8.5],
      [23.5, 9.5],
      [23.5, 10.5],
    ]);
    expect(dugoutGateX(home)).toBe(11);
    expect(dugoutGateX(away)).toBe(15);
  });
});

describe("venue obstacles", () => {
  it("groups the Gutter Bowl stalls into four 6 × 4 blocks", () => {
    const blocks = obstacleBlocks(PITCH_LAYOUTS["gutter-street"].obstacles);
    expect(blocks).toEqual([
      { kind: "market-stall", rect: { x0: 2, y0: 0, x1: 8, y1: 4 } },
      { kind: "market-stall", rect: { x0: 6, y0: 11, x1: 12, y1: 15 } },
      { kind: "market-stall", rect: { x0: 14, y0: 0, x1: 20, y1: 4 } },
      { kind: "market-stall", rect: { x0: 18, y0: 11, x1: 24, y1: 15 } },
    ]);
  });

  it("has no obstacles on the open venues", () => {
    expect(obstacleBlocks(PITCH_LAYOUTS.beach.obstacles)).toEqual([]);
  });
});

describe("wall hits", () => {
  const street = PITCH_LAYOUTS.street;

  it("puts a push off either sideline against that wall", () => {
    expect(wallHitFromSquare(street, { x: 4, y: -1 })).toEqual({
      x: 4.5,
      y: 0,
    });
    expect(wallHitFromSquare(street, { x: 9, y: 7 })).toEqual({ x: 9.5, y: 7 });
  });

  it("leaves a push over the end line to the crowd", () => {
    expect(wallHitFromSquare(street, { x: -1, y: 3 })).toBeNull();
  });

  it("puts a ball leaving from a sideline square against the wall", () => {
    expect(wallHitFromThrowIn(street, { x: 12, y: 6 })).toEqual({
      x: 12.5,
      y: 7,
    });
    expect(wallHitFromThrowIn(street, { x: 0, y: 3 })).toBeNull();
  });

  it("shows nothing at a venue without walls", () => {
    expect(wallHitFromSquare(PITCH_LAYOUTS.beach, { x: 4, y: -1 })).toBeNull();
  });
});

describe("game type label", () => {
  it("names nothing for Sevens and the pitch for Gutter Bowl", () => {
    expect(gameTypeLabel({})).toBeNull();
    expect(gameTypeLabel({ gameType: "street-bowl", venue: "street" })).toBe(
      "Street Bowl"
    );
    expect(
      gameTypeLabel({ gameType: "gutter-bowl", venue: "gutter-sewer" })
    ).toBe("Gutter Bowl sewer");
  });
});
