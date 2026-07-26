import { describe, it, expect } from "vitest";
import { RosterName } from "../../../src/types/Team";
import { buildAllSeedTeams } from "../../../src/seeding/teamFixtures";
import { decorateSeedTeams } from "../../../src/seeding/playerLifecycle";
import { buildSeedCompetitions } from "../../../src/seeding/competitionFixtures";
import {
  SeedValidationError,
  assertValidDevelopmentSeedData,
  validateDevelopmentSeedData,
} from "../../../src/seeding/validateSeeds";

function validCatalog() {
  const teams = buildAllSeedTeams();
  decorateSeedTeams(teams);
  const competitions = buildSeedCompetitions(teams);
  return { teams, competitions };
}

describe("validateSeeds", () => {
  it("accepts the generated catalog", () => {
    const { teams, competitions } = validCatalog();
    expect(validateDevelopmentSeedData(teams, competitions)).toEqual([]);
    expect(() =>
      assertValidDevelopmentSeedData(teams, competitions)
    ).not.toThrow();
  });

  it("detects finance tampering", () => {
    const { teams, competitions } = validCatalog();
    teams[0].treasury = teams[0].startingTreasury; // unspent 600k restored
    const violations = validateDevelopmentSeedData(teams, competitions);
    expect(violations.some((v) => v.area === "finances")).toBe(true);
  });

  it("detects career/SPP incoherence", () => {
    const { teams, competitions } = validCatalog();
    const orc = teams.find((t) => t.rosterName === RosterName.ORC)!;
    const legend = orc.players.find((p) => p.careerStats)!;
    legend.careerStats = { ...legend.careerStats!, touchdowns: 99 };
    const violations = validateDevelopmentSeedData(teams, competitions);
    expect(violations.some((v) => v.area === "progression")).toBe(true);
  });

  it("detects a missing champion on a completed tournament", () => {
    const { teams, competitions } = validCatalog();
    const cup = competitions.find(
      (d) => d.type === "tournament" && d.status === "complete"
    )!;
    delete (cup as { championEntrantId?: string }).championEntrantId;
    const violations = validateDevelopmentSeedData(teams, competitions);
    expect(
      violations.some(
        (v) => v.area === "competition" && v.detail.includes("champion")
      )
    ).toBe(true);
  });

  it("detects a team active in two competitions", () => {
    const { teams, competitions } = validCatalog();
    const activeLeague = competitions.find(
      (d) => d.type === "league" && d.status === "active"
    )!;
    const activeTournament = competitions.find(
      (d) => d.type === "tournament" && d.status === "active"
    )!;
    // Move one league entrant into the active tournament too
    const shared = activeLeague.entrants[0];
    activeTournament.entrants.push(shared);
    const violations = validateDevelopmentSeedData(teams, competitions);
    expect(violations.some((v) => v.area === "membership")).toBe(true);
  });

  it("throws SeedValidationError with every violation listed", () => {
    const { teams, competitions } = validCatalog();
    teams[0].treasury = -50_000;
    try {
      assertValidDevelopmentSeedData(teams, competitions);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(SeedValidationError);
      expect((error as SeedValidationError).violations.length).toBeGreaterThan(
        0
      );
    }
  });
});
