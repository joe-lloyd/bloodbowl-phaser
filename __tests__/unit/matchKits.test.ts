import { describe, expect, it } from "vitest";
import { matchKits } from "../../src/game/presentation/kits";

const RED = { primary: 0x8e1b1b, secondary: 0xffffff };
const CRIMSON = { primary: 0xb32020, secondary: 0xffffff };
const BLUE = { primary: 0x1e3a5f, secondary: 0xffffff };

describe("the kits two teams wear", () => {
  it("leaves sides that look different as they are", () => {
    expect(matchKits(RED, BLUE)).toEqual({ home: RED, away: BLUE });
  });

  it("puts an away side in the same shirts into its colours swapped", () => {
    const redAndGold = { primary: 0x8e1b1b, secondary: 0xd6b25e };
    expect(matchKits(RED, redAndGold)).toEqual({
      home: RED,
      away: { primary: 0xd6b25e, secondary: 0x8e1b1b },
    });
  });

  it("changes shirt when the swap would match the home trim", () => {
    expect(matchKits(RED, RED)).toEqual({
      home: RED,
      away: { primary: 0x1e3a5f, secondary: 0x8e1b1b },
    });
  });

  it("counts a shade of the same colour as a clash", () => {
    expect(matchKits(RED, CRIMSON).away).toEqual({
      primary: 0x1e3a5f,
      secondary: 0xb32020,
    });
  });

  it("finds a change shirt when the swap would clash too", () => {
    const white = { primary: 0xffffff, secondary: 0xe8ddc4 };
    expect(matchKits(white, white).away).toEqual({
      primary: 0x1e3a5f,
      secondary: 0xffffff,
    });
  });
});
