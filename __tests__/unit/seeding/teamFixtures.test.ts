import { describe, it, expect } from "vitest";
import { RosterName, calculateTeamValue } from "../../../src/types/Team";
import { PositionKeyWord } from "../../../src/types/Player";
import { validateRosterLegality } from "../../../src/game/rules/rosterLegality";
import { validateInsignificant } from "../../../src/game/rules/insignificant";
import { getRosterByRosterName } from "../../../src/data/RosterTemplates";
import {
  DRAFT_BUDGET,
  SeedFixtureError,
  buildAllSeedTeams,
  buildSeedTeam,
  seedAdvancementMode,
  teamFixtureKey,
} from "../../../src/seeding/teamFixtures";
import { SEED_NAMESPACE, SEED_VERSION } from "../../../src/seeding/seedMeta";

describe("teamFixtures", () => {
  const teams = buildAllSeedTeams();

  it("builds one team per supported roster", () => {
    expect(teams).toHaveLength(Object.values(RosterName).length);
  });

  it("every roster seed passes the shared legality validator", () => {
    for (const team of teams) {
      const roster = getRosterByRosterName(team.rosterName);
      expect(validateRosterLegality(team, roster), team.rosterName).toEqual([]);
      expect(validateInsignificant(team.players), team.rosterName).toBeNull();
    }
  });

  it("every team has 7-11 players with at most four non-Linemen", () => {
    for (const team of teams) {
      expect(team.players.length).toBeGreaterThanOrEqual(7);
      expect(team.players.length).toBeLessThanOrEqual(11);
      const nonLinemen = team.players.filter(
        (p) => !p.keywords.includes(PositionKeyWord.LINEMAN)
      );
      expect(nonLinemen.length).toBeLessThanOrEqual(4);
    }
  });

  it("derives treasury from the draft budget minus actual purchases", () => {
    for (const team of teams) {
      const spent =
        team.players.reduce((sum, p) => sum + p.cost, 0) +
        team.rerolls * team.rerollCost +
        (team.apothecary ? 50_000 : 0) +
        (team.coaches + team.cheerleaders + team.dedicatedFans) * 10_000;
      expect(team.treasury, team.rosterName).toBe(DRAFT_BUDGET - spent);
      expect(team.treasury, team.rosterName).toBeGreaterThanOrEqual(0);
      expect(team.treasury, team.rosterName).toBeLessThan(DRAFT_BUDGET);
    }
  });

  it("derives team value from the completed roster", () => {
    for (const team of teams) {
      expect(team.teamValue).toBe(calculateTeamValue(team));
      expect(team.teamValue).toBeGreaterThan(0);
    }
  });

  it("uses stable ids and seed ownership metadata", () => {
    const first = buildSeedTeam(RosterName.HUMAN);
    const second = buildSeedTeam(RosterName.HUMAN);
    expect(first.id).toBe(second.id);
    expect(first.players.map((p) => p.id)).toEqual(
      second.players.map((p) => p.id)
    );
    expect(first.seedMetadata).toEqual({
      namespace: SEED_NAMESPACE,
      version: SEED_VERSION,
      fixtureKey: teamFixtureKey(RosterName.HUMAN),
    });
  });

  it("every seed team has an explicit, locked advancement mode", () => {
    for (const team of teams) {
      expect(team.advancementMode, team.rosterName).toBeDefined();
      expect(team.advancementModeLocked, team.rosterName).toBe(true);
    }
  });

  it("the seed catalog covers all three advancement modes", () => {
    const modes = new Set(teams.map((team) => team.advancementMode));
    expect(modes).toEqual(
      new Set(["matched-play", "advanced-league", "sevens-skill-selection"])
    );
  });

  it("progressed founders (Human/Orc/Dwarf/Skaven) are Advanced League", () => {
    for (const rosterName of [
      RosterName.HUMAN,
      RosterName.ORC,
      RosterName.DWARF,
      RosterName.SKAVEN,
    ]) {
      expect(seedAdvancementMode(rosterName)).toBe("advanced-league");
      expect(buildSeedTeam(rosterName).advancementMode).toBe("advanced-league");
    }
  });

  it("fails with fixture-specific diagnostics", () => {
    const error = new SeedFixtureError("test-fixture", [
      { rule: "lineman-limit", detail: "5 players without the Lineman keyword" },
    ]);
    expect(error.message).toContain("test-fixture");
    expect(error.message).toContain("lineman-limit");
    expect(error.violations).toHaveLength(1);
  });
});
