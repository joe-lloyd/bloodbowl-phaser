import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  TeamLibraryUnavailableError,
  deleteAllSeedTeams,
  deleteTeam,
  getLocalRepository,
  getTeamById,
  loadTeams,
  saveTeams,
  seedAllRosterTeams,
  setTeamLibraryStatus,
  setTeamRepository,
} from "../../../src/game/managers/TeamManager";
import { TeamBuilder as TeamTestBuilder } from "../../utils/test-builders";

function localTeam() {
  return new TeamTestBuilder().withId("local-team").withName("Local").build();
}

function storageSnapshot(): string {
  return JSON.stringify(
    Object.keys(localStorage)
      .sort((a, b) => a.localeCompare(b))
      .map((key) => [key, localStorage.getItem(key)])
  );
}

describe.each(["loading", "failed"] as const)("team library %s", (status) => {
  beforeEach(() => {
    localStorage.clear();
    getLocalRepository().saveTeams([localTeam()]);
    setTeamLibraryStatus(status);
  });

  afterEach(() => {
    setTeamRepository(null);
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("reads no teams as the coach's", () => {
    expect(loadTeams()).toEqual([]);
    expect(getTeamById("local-team")).toBeUndefined();
  });

  it("refuses saves and deletes", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const before = storageSnapshot();
    await expect(saveTeams([localTeam()])).rejects.toBeInstanceOf(
      TeamLibraryUnavailableError
    );
    expect(() => deleteTeam("local-team")).toThrow(TeamLibraryUnavailableError);
    expect(storageSnapshot()).toBe(before);
  });

  it("refuses to seed or remove seed data before writing anything", () => {
    const before = storageSnapshot();
    expect(() => {
      seedAllRosterTeams();
    }).toThrow(TeamLibraryUnavailableError);
    expect(() => {
      deleteAllSeedTeams();
    }).toThrow(TeamLibraryUnavailableError);
    expect(storageSnapshot()).toBe(before);
  });
});

describe("team library loaded", () => {
  afterEach(() => {
    setTeamRepository(null);
    localStorage.clear();
  });

  it("reads and writes the active library as before", async () => {
    localStorage.clear();
    await saveTeams([localTeam()]);
    expect(loadTeams().map((team) => team.id)).toEqual(["local-team"]);
  });
});
