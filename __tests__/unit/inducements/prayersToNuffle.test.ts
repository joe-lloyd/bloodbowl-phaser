import { describe, expect, it } from "vitest";
import { rollPrayerToNuffle } from "../../../src/game/inducements/prayersToNuffle";
import { buildSeventsInducementProfile } from "../../../src/types/Inducements";

/**
 * Sevens' only Prayers to Nuffle change in scope for this change: rerolling
 * 10-13 outside Advanced League. The full 16-entry effect table is a
 * separate change (see design.md non-goals) — this only proves the
 * reroll-until-legal rule and its recording.
 */

describe("rollPrayerToNuffle", () => {
  it("rerolls a restricted result until an allowed one appears (non-Advanced-League)", () => {
    const profile = buildSeventsInducementProfile({ advancedLeague: false });
    const rolls = [12, 11, 5];
    let i = 0;
    const record = rollPrayerToNuffle(() => rolls[i++], profile, "team-a");

    expect(record.rejectedRolls).toEqual([12, 11]);
    expect(record.result).toBe(5);
    expect(record.teamId).toBe("team-a");
  });

  it("accepts a restricted result outright in Advanced League", () => {
    const profile = buildSeventsInducementProfile({ advancedLeague: true });
    const record = rollPrayerToNuffle(() => 12, profile, "team-a");
    expect(record.rejectedRolls).toEqual([]);
    expect(record.result).toBe(12);
  });

  it("a competition profile can still restrict 10-13 in Advanced League", () => {
    const profile = buildSeventsInducementProfile({
      advancedLeague: true,
      restrictPrayersInAdvancedLeague: true,
    });
    const rolls = [13, 7];
    let i = 0;
    const record = rollPrayerToNuffle(() => rolls[i++], profile, "team-a");
    expect(record.rejectedRolls).toEqual([13]);
    expect(record.result).toBe(7);
  });

  it("never rerolls a legal first result", () => {
    const profile = buildSeventsInducementProfile({ advancedLeague: false });
    const record = rollPrayerToNuffle(() => 3, profile, "team-a");
    expect(record.rejectedRolls).toEqual([]);
    expect(record.result).toBe(3);
  });
});
