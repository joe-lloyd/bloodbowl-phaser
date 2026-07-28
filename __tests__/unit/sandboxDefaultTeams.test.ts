/**
 * SandboxScene's no-args default matchup (no teams passed, no scenario
 * loaded yet) must be Human vs. Orc — never a mirror-match, and never
 * Black Orc, whose default Grab widens push options and made basic
 * chain-push behavior hard to see without hovering to check the roster.
 * openspec/specs/sandbox-rule-explorer: "Default sandbox matchup is never
 * a mirror-match".
 */
import { describe, it, expect } from "vitest";
import { RosterName } from "../../src/types/Team";
import {
  SANDBOX_DEFAULT_TEAM1_ROSTER,
  SANDBOX_DEFAULT_TEAM2_ROSTER,
} from "../../src/scenes/sandboxDefaultTeams";

describe("sandbox default teams", () => {
  it("team 1 defaults to Human and team 2 to Orc", () => {
    expect(SANDBOX_DEFAULT_TEAM1_ROSTER).toBe(RosterName.HUMAN);
    expect(SANDBOX_DEFAULT_TEAM2_ROSTER).toBe(RosterName.ORC);
  });

  it("is never Black Orc vs. Black Orc", () => {
    expect(SANDBOX_DEFAULT_TEAM2_ROSTER).not.toBe(RosterName.BLACK_ORC);
  });

  it("the two default rosters are never identical", () => {
    expect(SANDBOX_DEFAULT_TEAM1_ROSTER).not.toBe(SANDBOX_DEFAULT_TEAM2_ROSTER);
  });
});
