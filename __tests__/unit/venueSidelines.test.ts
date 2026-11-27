import { describe, expect, it } from "vitest";
import meta from "../../public/stadium/bloodbowl/meta.json";
import beachMeta from "../../public/venues/beach/meta.json";
import arenaMeta from "../../public/venues/deathbowl/meta.json";
import gutterSewerMeta from "../../public/venues/gutter-sewer/meta.json";
import gutterStreetMeta from "../../public/venues/gutter-street/meta.json";
import streetMeta from "../../public/venues/street/meta.json";
import { parseStadiumMeta } from "../../src/boundary/stadium";
import {
  ARENA_SEATS,
  arenaDugouts,
  dugoutGateX,
  venueDugouts,
} from "../../src/game/presentation/venueSidelines";
import {
  PITCH_LAYOUTS,
  isInsideLayout,
} from "../../src/game/variants/pitchLayouts";
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

describe("rendered venues", () => {
  const rendered = [
    ["street", streetMeta],
    ["beach", beachMeta],
    ["gutter-street", gutterStreetMeta],
    ["gutter-sewer", gutterSewerMeta],
  ] as const;

  it.each(rendered)(
    "draws the %s pitch, dugouts and obstacles where the rules put them",
    (venue, raw) => {
      const layout = PITCH_LAYOUTS[venue];
      const art = parseStadiumMeta(raw);
      expect([art.layout, art.cols, art.rows]).toEqual([
        venue,
        layout.cols,
        layout.rows,
      ]);
      expect(art.dugouts).toEqual(venueDugouts(layout));
      expect(raw.obstacles).toEqual(layout.obstacles.map(({ x, y }) => [x, y]));
    }
  );

  it.each([
    ["gutter-street", gutterStreetMeta],
    ["gutter-sewer", gutterSewerMeta],
  ] as const)(
    "draws the %s barricades on the lines the rules use",
    (venue, raw) => {
      expect(raw.barricades).toEqual(
        PITCH_LAYOUTS[venue].barricades.map(({ afterColumn, rows }) => [
          afterColumn,
          rows.min,
          rows.max,
        ])
      );
    }
  );

  it("puts the Gutter Bowl stalls on 96 squares and the open venues on none", () => {
    expect(gutterStreetMeta.obstacles).toHaveLength(96);
    expect(gutterSewerMeta.obstacles).toHaveLength(96);
    expect(beachMeta.obstacles).toEqual([]);
    expect(streetMeta.obstacles).toEqual([]);
  });
});

describe("Deathbowl arena", () => {
  const arena = PITCH_LAYOUTS.deathbowl;
  const dugouts = arenaDugouts(arena);

  it("puts each seat's dugout in the corner beside its own arm, reserves nearest the pitch", () => {
    expect(dugouts.north.reserves.slice(0, 4)).toEqual([
      [17.5, 3.5],
      [17.5, 2.5],
      [17.5, 1.5],
      [17.5, 0.5],
    ]);
    expect(dugouts.east.reserves[0]).toEqual([17.5, 17.5]);
    expect(dugouts.south.reserves[0]).toEqual([3.5, 17.5]);
    expect(dugouts.west["sent off"]).toEqual([
      [-6.5, 3.5],
      [-6.5, 2.5],
      [-6.5, 1.5],
    ]);
  });

  it("keeps the 33 squares of all four dugouts apart and off the pitch", () => {
    const squares = ARENA_SEATS.flatMap((seat) =>
      Object.values(dugouts[seat]).flat()
    );
    expect(squares).toHaveLength(132);
    expect(
      new Set(squares.map(([x, y]) => `${String(x)},${String(y)}`)).size
    ).toBe(132);
    expect(
      squares.filter(([x, y]) =>
        isInsideLayout(arena, { x: Math.floor(x), y: Math.floor(y) })
      )
    ).toEqual([]);
  });

  it("draws the arena's dugouts where the game puts them, with a tint layer per seat", () => {
    expect([arenaMeta.layout, arenaMeta.cols, arenaMeta.rows]).toEqual([
      "deathbowl",
      21,
      21,
    ]);
    expect(arenaMeta.dugouts).toEqual(dugouts);
    expect(Object.keys(arenaMeta.masks)).toEqual([...ARENA_SEATS]);
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
