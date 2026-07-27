import { describe, expect, it } from "vitest";
import {
  getEmptySidelineCrewInfo,
  getSidelineCrewInfo,
  getVisibleSidelineStaff,
  SIDELINE_STAFF_CAPS,
} from "../../src/game/presentation/sidelineStaff";
import { Team } from "../../src/types/Team";

function teamWith(overrides: Partial<Team>): Team {
  return {
    coaches: 0,
    cheerleaders: 0,
    apothecary: false,
    dedicatedFans: 0,
    ...overrides,
  } as Team;
}

describe("sideline crew projection: names and effect text", () => {
  it("carries a display name and match-effect description on every drawn figure", () => {
    const team = teamWith({
      coaches: 1,
      cheerleaders: 1,
      apothecary: true,
      dedicatedFans: 1,
    });
    const staff = getVisibleSidelineStaff(team);

    const byType = Object.fromEntries(staff.map((m) => [m.type, m]));
    expect(byType.coach).toMatchObject({
      name: "Assistant Coach",
      effect: expect.stringContaining("Brilliant Coaching"),
    });
    expect(byType.cheerleader).toMatchObject({
      name: "Cheerleader",
      effect: expect.stringContaining("Cheering Fans"),
    });
    expect(byType.apothecary).toMatchObject({
      name: "Apothecary",
      effect: expect.stringContaining("Knocked Out"),
    });
    expect(byType.fan).toMatchObject({
      name: "Dedicated Fan",
      effect: expect.stringContaining("Pitch Invasion"),
    });
  });
});

describe("sideline crew projection: real vs. drawn counts", () => {
  it("reports the team's real count even when it exceeds the rail's cap", () => {
    const team = teamWith({ cheerleaders: SIDELINE_STAFF_CAPS.cheerleader + 3 });

    const drawn = getVisibleSidelineStaff(team).filter(
      (m) => m.type === "cheerleader"
    );
    expect(drawn).toHaveLength(SIDELINE_STAFF_CAPS.cheerleader);

    const info = getSidelineCrewInfo("cheerleader", team);
    expect(info.count).toBe(SIDELINE_STAFF_CAPS.cheerleader + 3);
    expect(info.count).not.toBe(drawn.length);
  });

  it("reports 0 for a staff type the team does not have", () => {
    const team = teamWith({});
    expect(getSidelineCrewInfo("coach", team).count).toBe(0);
    expect(getSidelineCrewInfo("apothecary", team).count).toBe(0);
  });

  it("reports 1 for a present apothecary regardless of the boolean flag shape", () => {
    const team = teamWith({ apothecary: true });
    expect(getSidelineCrewInfo("apothecary", team).count).toBe(1);
  });
});

describe("sideline crew projection: the empty rail", () => {
  it("explains that the team has no staff and what it costs them", () => {
    const info = getEmptySidelineCrewInfo();
    expect(info.type).toBeNull();
    expect(info.count).toBe(0);
    expect(info.effect).toMatch(/no sideline staff/i);
    expect(info.effect).toContain("Brilliant Coaching");
    expect(info.effect).toContain("Cheering Fans");
    expect(info.effect).toContain("Pitch Invasion");
  });
});
