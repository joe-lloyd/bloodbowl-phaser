/**
 * Integration: seed refresh is idempotent and cleanup is safe beside
 * coach-created records (teams in localStorage, competitions in the local
 * competition store).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { RosterName, createTeam } from "../../src/types/Team";
import {
  loadTeams,
  saveTeams,
  seedAllRosterTeams,
  deleteAllSeedTeams,
} from "../../src/game/managers/TeamManager";
import {
  readLocalCompetitions,
  saveCompetition,
} from "../../src/competition/repository";
import { LeagueDoc } from "../../src/competition/types";
import {
  cleanupDevelopmentSeedData,
  seedDevelopmentData,
} from "../../src/seeding/runner";
import { validateDevelopmentSeedData } from "../../src/seeding/validateSeeds";
import { isSeedOwned } from "../../src/seeding/seedMeta";

function coachTeam(name: string) {
  const team = createTeam(name, RosterName.HUMAN, {
    primary: 0x123456,
    secondary: 0x654321,
  });
  return team;
}

function coachLeague(id: string): LeagueDoc {
  return {
    id,
    type: "league",
    name: "Coach League",
    organizerUid: null,
    participantUids: [],
    status: "draft",
    entrants: [],
    fixtures: [],
    standings: [],
    points: { win: 3, draw: 1, loss: 0 },
    createdAt: 1,
    updatedAt: 1,
  };
}

describe("development seed integration", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("running the same seed version twice converges (no duplicates)", () => {
    seedDevelopmentData();
    const firstTeams = loadTeams();
    const firstIds = firstTeams.map((t) => t.id).sort();
    const firstCompetitions = readLocalCompetitions().length;

    seedDevelopmentData();
    const secondTeams = loadTeams();
    expect(secondTeams.map((t) => t.id).sort()).toEqual(firstIds);
    expect(secondTeams).toHaveLength(firstTeams.length);
    expect(readLocalCompetitions()).toHaveLength(firstCompetitions);

    // No duplicate ids anywhere
    expect(new Set(firstIds).size).toBe(firstIds.length);
  });

  it("the persisted catalog passes the invariant validator", () => {
    seedDevelopmentData();
    const violations = validateDevelopmentSeedData(
      loadTeams(),
      readLocalCompetitions()
    );
    expect(violations).toEqual([]);
  });

  it("cleanup removes only seed-owned records, keeping coach records", () => {
    // Coach-created records sit beside the seeds
    const mine = coachTeam("My Custom Team");
    saveTeams([mine]);
    void saveCompetition(coachLeague("coach-league-1"));

    seedDevelopmentData();
    expect(loadTeams().length).toBeGreaterThan(1);

    const result = cleanupDevelopmentSeedData();
    expect(result.removedTeams).toBeGreaterThan(0);
    expect(result.removedCompetitions).toBeGreaterThan(0);

    const remainingTeams = loadTeams();
    expect(remainingTeams).toHaveLength(1);
    expect(remainingTeams[0].id).toBe(mine.id);
    expect(isSeedOwned(remainingTeams[0])).toBe(false);

    const remainingCompetitions = readLocalCompetitions();
    expect(remainingCompetitions).toHaveLength(1);
    expect(remainingCompetitions[0].id).toBe("coach-league-1");
  });

  it("a refresh replaces legacy ' Sample' teams but not coach teams", () => {
    const legacy = createTeam("Orc Sample", RosterName.ORC, {
      primary: 1,
      secondary: 2,
    });
    const coach = coachTeam("Sample Collector XI");
    saveTeams([legacy, coach]);

    seedDevelopmentData();

    const teams = loadTeams();
    expect(teams.some((t) => t.name === "Orc Sample")).toBe(false);
    expect(teams.some((t) => t.id === coach.id)).toBe(true);
    expect(teams.filter(isSeedOwned).length).toBeGreaterThan(0);
  });

  it("version-targeted cleanup removes only that seed version", () => {
    seedDevelopmentData();
    // Pretend a stray record from an older version exists
    const teams = loadTeams();
    const stray = {
      ...coachTeam("Stray Old Seed"),
      seedMetadata: {
        namespace: "dev-seed",
        version: 999,
        fixtureKey: "stray",
      },
    };
    saveTeams([...teams, stray]);

    const result = cleanupDevelopmentSeedData(999);
    expect(result.removedTeams).toBe(1);
    // Current-version seeds untouched
    expect(loadTeams().filter(isSeedOwned).length).toBe(teams.length);
  });

  it("the TeamManager entry points delegate to the seed runner", () => {
    seedAllRosterTeams();
    expect(loadTeams().filter(isSeedOwned).length).toBeGreaterThan(0);
    expect(readLocalCompetitions().filter(isSeedOwned)).toHaveLength(6);

    deleteAllSeedTeams();
    expect(loadTeams().filter(isSeedOwned)).toHaveLength(0);
    expect(readLocalCompetitions().filter(isSeedOwned)).toHaveLength(0);
  });
});
