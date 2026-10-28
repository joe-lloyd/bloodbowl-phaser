import { describe, expect, it } from "vitest";
import {
  DEFAULT_PITCH_THEME_ID,
  PITCH_THEMES,
  resolvePitchTheme,
} from "../../src/game/presentation/pitchThemes";
import {
  getVisibleSidelineStaff,
  SIDELINE_STAFF_CAPS,
} from "../../src/game/presentation/sidelineStaff";
import { Team } from "../../src/types/Team";

describe("match styles", () => {
  it("offers Blood Bowl and Neon, with Blood Bowl as the default", () => {
    expect(PITCH_THEMES.map((theme) => theme.id)).toEqual([
      "bloodbowl",
      "neon",
    ]);
    expect(DEFAULT_PITCH_THEME_ID).toBe("bloodbowl");
  });

  it("gives every style its own stadium and sprite folders", () => {
    for (const theme of PITCH_THEMES) {
      expect(theme.stadiumPath).toBe(`/stadium/${theme.id}`);
      expect(theme.spritePath).toBe(`/sprites/${theme.id}`);
    }
  });

  it("loads saves and lobbies from before the styles with the default", () => {
    for (const legacy of ["classic", "mud", "astro", "wasteland", null]) {
      expect(resolvePitchTheme(legacy).id).toBe("bloodbowl");
    }
    expect(resolvePitchTheme("neon").id).toBe("neon");
  });
});

describe("sideline staff", () => {
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
