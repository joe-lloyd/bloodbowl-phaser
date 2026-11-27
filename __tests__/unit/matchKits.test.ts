import { describe, expect, it } from "vitest";
import { kitOf, matchKits } from "../../src/game/presentation/kits";
import { teamWith } from "./controllers/controllerFixtures";

const RED = { primary: 0x8e1b1b, secondary: 0xffffff };
const CRIMSON = { primary: 0xb32020, secondary: 0xffffff };
const BLUE = { primary: 0x1e3a5f, secondary: 0xffffff };

describe("the kits two teams wear", () => {
  it("leaves sides that look different as they are", () => {
    expect(matchKits([RED, BLUE])).toEqual([RED, BLUE]);
  });

  it("puts an away side in the same shirts into its colours swapped", () => {
    const redAndGold = { primary: 0x8e1b1b, secondary: 0xd6b25e };
    expect(matchKits([RED, redAndGold])).toEqual([
      RED,
      { primary: 0xd6b25e, secondary: 0x8e1b1b },
    ]);
  });

  it("changes shirt when the swap would match the home trim", () => {
    expect(matchKits([RED, RED])).toEqual([
      RED,
      { primary: 0x1e3a5f, secondary: 0x8e1b1b },
    ]);
  });

  it("counts a shade of the same colour as a clash", () => {
    expect(matchKits([RED, CRIMSON])[1]).toEqual({
      primary: 0x1e3a5f,
      secondary: 0xb32020,
    });
  });

  it("finds a change shirt when the swap would clash too", () => {
    const white = { primary: 0xffffff, secondary: 0xe8ddc4 };
    expect(matchKits([white, white])[1]).toEqual({
      primary: 0x1e3a5f,
      secondary: 0xffffff,
    });
  });
});

describe("the kits four teams wear", () => {
  it("gives four teams in the same red four different shirts", () => {
    expect(matchKits([RED, RED, CRIMSON, RED])).toEqual([
      RED,
      { primary: 0x1e3a5f, secondary: 0x8e1b1b },
      { primary: 0xd6b25e, secondary: 0xb32020 },
      { primary: 0x000000, secondary: 0x8e1b1b },
    ]);
  });

  it("looks a team's kit up by its id", () => {
    const teams = ["north", "east", "south", "west"].map((id) =>
      teamWith({ id, colors: RED })
    );
    expect(kitOf(teams, "south").primary).toBe(0xd6b25e);
  });
});
