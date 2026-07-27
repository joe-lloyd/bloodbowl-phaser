import { describe, expect, it } from "vitest";
import { GameConfig } from "../../src/config/GameConfig";
import { gridToPixel, pixelToGrid } from "../../src/game/elements/GridUtils";
import {
  DEFAULT_PITCH_THEME_ID,
  getPitchPresentation,
  PITCH_THEMES,
  resolvePitchTheme,
} from "../../src/game/presentation/pitchThemes";
import {
  getVisibleSidelineStaff,
  SIDELINE_STAFF_CAPS,
} from "../../src/game/presentation/sidelineStaff";
import {
  DUGOUT_LAYOUT,
  getDugoutLayout,
} from "../../src/game/presentation/dugoutLayout";
import { Team } from "../../src/types/Team";

describe("pitch themes", () => {
  it("provides four unique drawn-first themes and a safe fallback", () => {
    expect(PITCH_THEMES.map((theme) => theme.id)).toEqual([
      "classic",
      "mud",
      "astro",
      "wasteland",
    ]);
    expect(new Set(PITCH_THEMES.map((theme) => theme.id)).size).toBe(4);
    expect(resolvePitchTheme("missing").id).toBe(DEFAULT_PITCH_THEME_ID);

    for (const theme of PITCH_THEMES) {
      expect(theme.surface.top).toEqual(expect.any(Number));
      expect(theme.surface.bottom).toEqual(expect.any(Number));
      expect(theme.lines.grid).toEqual(expect.any(Number));
      expect(theme.dugout.panel).toEqual(expect.any(Number));
      expect(theme.dugout.sentOff).toEqual(expect.any(Number));
    }
  });

  it("keeps grid and pixel geometry identical for every theme", () => {
    const sampleSquares = [
      { x: 0, y: 0 },
      { x: 7, y: 2 },
      { x: 10, y: 5 },
      { x: 19, y: 10 },
    ];
    const baseline = sampleSquares.map((square) =>
      gridToPixel(square.x, square.y, GameConfig.SQUARE_SIZE)
    );

    for (const theme of PITCH_THEMES) {
      const presentation = getPitchPresentation(theme.id);
      expect(presentation).toMatchObject({
        width: 20,
        height: 11,
        squareSize: 60,
        pixelWidth: 1200,
        pixelHeight: 660,
      });
      expect(
        sampleSquares.map((square) =>
          gridToPixel(square.x, square.y, presentation.squareSize)
        )
      ).toEqual(baseline);
      baseline.forEach((pixel, index) => {
        expect(pixelToGrid(pixel.x, pixel.y, presentation.squareSize)).toEqual(
          sampleSquares[index]
        );
      });
    }
  });
});

describe("themed dugout presentation", () => {
  it("adds a staff rail without moving any legacy player-grid world slot", () => {
    const top = getDugoutLayout(false);
    const bottom = getDugoutLayout(true);

    // The Sent Off section (added for foul-injury-resolution) widens the
    // dugout beyond the pitch's own pixel width — a deliberate, small
    // (rare-case) footprint growth, not a layout regression. totalWidth is
    // always every section plus the staff rail, for either orientation.
    const expectedSectionsWidth =
      top.sections.reserves.width +
      top.sections.ko.width +
      top.sections.casualty.width +
      top.sections.sentOff.width;
    expect(top.totalWidth).toBe(
      expectedSectionsWidth + DUGOUT_LAYOUT.staffWidth
    );
    expect(bottom.totalWidth).toBe(top.totalWidth);

    // Non-mirrored: Reserves/KO/Casualty keep their original world slots —
    // Sent Off is appended after Casualty, so it never shifts them.
    expect(top.sections.reserves.x).toBe(0);
    expect(top.sections.ko.x).toBe(top.sections.reserves.width);
    expect(top.sections.casualty.x).toBe(
      top.sections.reserves.width + top.sections.ko.width
    );
    expect(top.sections.sentOff.x).toBe(
      top.sections.reserves.width +
        top.sections.ko.width +
        top.sections.casualty.width
    );
    expect(top.sections.reserves.x + DUGOUT_LAYOUT.gridOffsetX).toBe(10);

    // Mirrored: the staff rail sits on the left and the section order
    // reverses (Sent Off, Casualty, KO, Reserves), keeping Reserves — the
    // team-colored section — nearest the pitch on both sides.
    expect(bottom.sections.sentOff.x).toBe(DUGOUT_LAYOUT.staffWidth);
    expect(bottom.sections.casualty.x).toBe(
      DUGOUT_LAYOUT.staffWidth + bottom.sections.sentOff.width
    );
    expect(bottom.sections.ko.x).toBe(
      DUGOUT_LAYOUT.staffWidth +
        bottom.sections.sentOff.width +
        bottom.sections.casualty.width
    );
    expect(bottom.sections.reserves.x).toBe(
      DUGOUT_LAYOUT.staffWidth +
        bottom.sections.sentOff.width +
        bottom.sections.casualty.width +
        bottom.sections.ko.width
    );
  });

  it("scales visible staff to team counts and caps every type", () => {
    const team = {
      coaches: 12,
      cheerleaders: 9,
      apothecary: true,
      dedicatedFans: 20,
    } as Team;
    const staff = getVisibleSidelineStaff(team);

    expect(staff.filter((member) => member.type === "coach")).toHaveLength(
      SIDELINE_STAFF_CAPS.coach
    );
    expect(
      staff.filter((member) => member.type === "cheerleader")
    ).toHaveLength(SIDELINE_STAFF_CAPS.cheerleader);
    expect(staff.filter((member) => member.type === "apothecary")).toHaveLength(
      1
    );
    expect(staff.filter((member) => member.type === "fan")).toHaveLength(
      SIDELINE_STAFF_CAPS.fan
    );
    expect(staff.length).toBeLessThanOrEqual(12);
  });
});
