import { describe, expect, it } from "vitest";
import {
  type FourSeating,
  rivalsOf,
  seatTeams,
} from "../../../src/game/seating";
import {
  freshSpend,
  maySpend,
  openTargets,
  spend,
  spendFromWire,
  spendToWire,
  targetOf,
} from "../../../src/game/rules/turnSpend";
import { PITCH_LAYOUTS } from "../../../src/game/variants/pitchLayouts";
import { teamWith } from "../controllers/controllerFixtures";

const stadium = PITCH_LAYOUTS.stadium;
const team = (id: string) => teamWith({ id, name: id, players: [] });

function fourSeats(): FourSeating {
  const [home, away] = stadium.frames;
  return {
    kind: "four",
    seats: [
      { index: 0, team: team("north"), frame: home },
      { index: 1, team: team("east"), frame: away },
      { index: 2, team: team("south"), frame: home },
      { index: 3, team: team("west"), frame: away },
    ],
  };
}

const northRivals = (seating: FourSeating) =>
  rivalsOf(seating, "north").map((seat) => seat.team.id);

describe("a pair of teams with one ball", () => {
  const pair = seatTeams([team("home"), team("away")], stadium);

  it("targets the only rival when no team is named", () => {
    expect(targetOf(pair, "home", undefined)).toBe("away");
    expect(targetOf(pair, "away", undefined)).toBe("home");
  });

  it("allows one of each limited action, like the old flags", () => {
    let ledger = freshSpend();
    for (const kind of ["blitz", "foul"] as const) {
      expect(maySpend(ledger, { kind, against: "away" })).toBe(true);
      ledger = spend(ledger, { kind, against: "away" });
      expect(maySpend(ledger, { kind, against: "away" })).toBe(false);
    }
    for (const kind of ["pass", "handoff"] as const) {
      expect(maySpend(ledger, { kind })).toBe(true);
      ledger = spend(ledger, { kind });
      expect(maySpend(ledger, { kind })).toBe(false);
    }
    expect(ledger).toEqual({
      ...freshSpend(),
      blitzed: ["away"],
      fouled: ["away"],
      passes: 1,
      handOffs: 1,
    });
  });

  it("keeps each limit apart from the others", () => {
    const blitzed = spend(freshSpend(), { kind: "blitz", against: "away" });

    expect(maySpend(blitzed, { kind: "foul", against: "away" })).toBe(true);
    expect(maySpend(blitzed, { kind: "pass" })).toBe(true);
    expect(maySpend(blitzed, { kind: "handoff" })).toBe(true);
    expect(openTargets(blitzed, ["away"], "blitz")).toEqual([]);
    expect(openTargets(blitzed, ["away"], "foul")).toEqual(["away"]);
  });

  it("spends the Blitz target at declaration, with no block thrown", () => {
    const declared = spend(freshSpend(), { kind: "blitz", against: "away" });

    expect(maySpend(declared, { kind: "blitz", against: "away" })).toBe(false);
  });
});

describe("four seats", () => {
  const seating = fourSeats();

  it("needs a named target, since the mover has three rivals", () => {
    expect(targetOf(seating, "north", undefined)).toBeUndefined();
    expect(targetOf(seating, "north", "south")).toBe("south");
  });

  it("allows one Blitz against each rival and refuses a second against the same one", () => {
    const rivals = northRivals(seating);
    expect(rivals).toEqual(["east", "south", "west"]);

    let ledger = freshSpend();
    for (const against of rivals) {
      expect(maySpend(ledger, { kind: "blitz", against })).toBe(true);
      ledger = spend(ledger, { kind: "blitz", against });
    }

    expect(maySpend(ledger, { kind: "blitz", against: "east" })).toBe(false);
    expect(openTargets(ledger, rivals, "blitz")).toEqual([]);
    expect(openTargets(ledger, rivals, "foul")).toEqual([
      "east",
      "south",
      "west",
    ]);
  });

  it("leaves the other rivals open after one Blitz", () => {
    const ledger = spend(freshSpend(), { kind: "blitz", against: "south" });

    expect(openTargets(ledger, northRivals(seating), "blitz")).toEqual([
      "east",
      "west",
    ]);
  });
});

describe("the wire", () => {
  it("writes the four flags alone for two seats", () => {
    const ledger = spend(freshSpend(), { kind: "foul", against: "away" });

    expect(spendToWire(ledger, 2)).toEqual({
      hasBlitzed: false,
      hasPassed: false,
      hasHandedOff: false,
      hasFouled: true,
    });
    expect(Object.keys(spendToWire(ledger, 2))).toEqual([
      "hasBlitzed",
      "hasPassed",
      "hasHandedOff",
      "hasFouled",
    ]);
  });

  it("reads an old save's flags as spent against the only rival", () => {
    const wire = {
      hasBlitzed: true,
      hasPassed: true,
      hasHandedOff: false,
      hasFouled: false,
    };

    expect(spendFromWire(wire, ["away"])).toEqual({
      ...freshSpend(),
      blitzed: ["away"],
      fouled: [],
      passes: 1,
      handOffs: 0,
    });
  });

  it("carries the ledger itself beyond two seats", () => {
    const ledger = spend(spend(freshSpend(), { kind: "blitz", against: "east" }), {
      kind: "blitz",
      against: "west",
    });
    const wire = spendToWire(ledger, 4);

    expect(wire.hasBlitzed).toBe(true);
    expect(spendFromWire(wire, ["east", "south", "west"])).toEqual({
      ...freshSpend(),
      blitzed: ["east", "west"],
      fouled: [],
      passes: 0,
      handOffs: 0,
    });
  });
});
