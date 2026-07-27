import { describe, expect, it } from "vitest";
import { RosterName, createTeam } from "../../../src/types/Team";
import {
  backfillFirstMatchPlayedAt,
  getTeamMode,
  isActiveTeam,
  isDraftTeam,
  stampFirstCompletedMatch,
} from "../../../src/game/rules/teamLifecycle";

function team() {
  return createTeam("Test", RosterName.HUMAN, { primary: 0, secondary: 0 }, 50000);
}

describe("teamLifecycle", () => {
  it("a new team is draft", () => {
    const t = team();
    expect(getTeamMode(t)).toBe("draft");
    expect(isDraftTeam(t)).toBe(true);
    expect(isActiveTeam(t)).toBe(false);
  });

  it("stamping the first completed match makes a team active", () => {
    const t = team();
    stampFirstCompletedMatch(t, 1000);
    expect(t.firstMatchPlayedAt).toBe(1000);
    expect(getTeamMode(t)).toBe("active");
    expect(isActiveTeam(t)).toBe(true);
  });

  it("stamping is idempotent — the first timestamp sticks", () => {
    const t = team();
    stampFirstCompletedMatch(t, 1000);
    stampFirstCompletedMatch(t, 2000);
    expect(t.firstMatchPlayedAt).toBe(1000);
  });

  it("an abandoned match (never stamped) leaves the team in draft", () => {
    const t = team();
    // Simulates a match that never reached confirmation — nothing calls
    // stampFirstCompletedMatch.
    expect(getTeamMode(t)).toBe("draft");
  });

  it("backfill activates a team with recorded history", () => {
    const t = team();
    t.wins = 2;
    t.losses = 1;
    backfillFirstMatchPlayedAt(t, 5000);
    expect(t.firstMatchPlayedAt).toBe(5000);
    expect(isActiveTeam(t)).toBe(true);
  });

  it("backfill leaves an unplayed team in draft", () => {
    const t = team();
    backfillFirstMatchPlayedAt(t, 5000);
    expect(t.firstMatchPlayedAt).toBeUndefined();
    expect(isDraftTeam(t)).toBe(true);
  });

  it("backfill never overwrites an existing stamp", () => {
    const t = team();
    stampFirstCompletedMatch(t, 42);
    t.wins = 3;
    backfillFirstMatchPlayedAt(t, 999);
    expect(t.firstMatchPlayedAt).toBe(42);
  });
});
