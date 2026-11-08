/**
 * Team persistence backends: signed-out localStorage, signed-in cloud
 * write-through cache, and the one-time local→cloud migration.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { RosterName, Team } from "../../src/types/Team";

const cloudDocuments = vi.hoisted(() => new Map<string, unknown>());

// Mock the Firestore SDK surface used by cloudTeamRepository. Refs encode
// their path so assertions can check which user's library was touched.
vi.mock("firebase/firestore", () => ({
  collection: vi.fn((_db: unknown, ...path: string[]) => ({
    path: path.join("/"),
  })),
  doc: vi.fn((col: { path: string }, id: string) => ({
    path: `${col.path}/${id}`,
  })),
  setDoc: vi.fn((ref: { path: string }, data: unknown) => {
    cloudDocuments.set(ref.path, data);
    return Promise.resolve();
  }),
  runTransaction: vi.fn(
    async (
      _db: unknown,
      run: (transaction: {
        get: (ref: {
          path: string;
        }) => Promise<{ exists: () => boolean; data: () => unknown }>;
        delete: (ref: { path: string }) => void;
      }) => Promise<void>
    ) =>
      run({
        get: async (ref) => ({
          exists: () => cloudDocuments.has(ref.path),
          data: () => cloudDocuments.get(ref.path),
        }),
        delete: (ref) => {
          cloudDocuments.delete(ref.path);
        },
      })
  ),
  getDocs: vi.fn(() => Promise.resolve({ docs: [] })),
}));

vi.mock("../../src/firebase/config", () => ({
  getDb: vi.fn(() => ({})),
  isFirebaseConfigured: vi.fn(() => true),
}));

import { setDoc } from "firebase/firestore";
import {
  saveTeams,
  loadTeams,
  setTeamRepository,
  deleteTeam,
} from "../../src/game/managers/TeamManager";
import { createComputerTeam } from "../../src/competition/computerTeams";
import {
  CloudTeamRepository,
  migrateLocalTeams,
} from "../../src/firebase/cloudTeamRepository";

const setDocMock = vi.mocked(setDoc);

function makeTeam(id: string, name = id): Team {
  return { id, name, players: [] } as unknown as Team;
}

/** Let the repository's fire-and-forget Firestore writes settle. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  localStorage.clear();
  setTeamRepository(null);
  vi.clearAllMocks();
  cloudDocuments.clear();
});

describe("signed-out persistence", () => {
  it("reports a failed deletion and keeps the local team", () => {
    const team = createComputerTeam(
      RosterName.ORC,
      "Local team",
      0x224488,
      "advanced-league"
    );
    saveTeams([team]);
    const write = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementationOnce(() => {
        throw new Error("Storage is unavailable");
      });
    try {
      expect(() => deleteTeam(team.id)).toThrow("Storage is unavailable");
      expect(loadTeams().map((saved) => saved.id)).toEqual([team.id]);
    } finally {
      write.mockRestore();
    }
  });

  it("saves and loads through localStorage", () => {
    saveTeams([makeTeam("t1", "Locals")]);

    const stored = JSON.parse(localStorage.getItem("bloodbowl_teams")!);
    expect(stored).toHaveLength(1);
    expect(stored[0].name).toBe("Locals");
    expect(loadTeams()[0].id).toBe("t1");
    expect(setDocMock).not.toHaveBeenCalled();
  });
});

describe("signed-in cloud repository", () => {
  it("refuses deletion when another repository entered the computer team", async () => {
    const team = createComputerTeam(
      RosterName.ORC,
      "Nuln Hammers",
      0x224488,
      "advanced-league"
    );
    const staleTab = new CloudTeamRepository("user-a", [structuredClone(team)]);
    const otherTab = new CloudTeamRepository("user-a", [structuredClone(team)]);
    otherTab.saveTeams([{ ...team, activeCompetitionId: "league-1" }]);
    await flush();
    setTeamRepository(staleTab);
    expect(loadTeams()[0].activeCompetitionId).toBeUndefined();

    await expect(
      Promise.resolve().then(() => deleteTeam(team.id))
    ).rejects.toThrow("still playing in a competition");

    expect(cloudDocuments.get(`users/user-a/teams/${team.id}`)).toMatchObject({
      id: team.id,
      activeCompetitionId: "league-1",
    });
    expect(loadTeams().map((saved) => saved.id)).toEqual([team.id]);
  });

  it("deletes a free team without overwriting another tab's changes to other teams", async () => {
    const team = createComputerTeam(
      RosterName.ORC,
      "Free team",
      0x224488,
      "advanced-league"
    );
    const keep = createComputerTeam(
      RosterName.HUMAN,
      "Keep me",
      0x224488,
      "advanced-league"
    );
    const staleTab = new CloudTeamRepository("user-a", [team, keep]);
    const otherTab = new CloudTeamRepository("user-a", [
      structuredClone(team),
      structuredClone(keep),
    ]);
    otherTab.saveTeams([team, { ...keep, activeCompetitionId: "league-2" }]);
    await flush();
    setTeamRepository(staleTab);

    await deleteTeam(team.id);

    expect(cloudDocuments.has(`users/user-a/teams/${team.id}`)).toBe(false);
    expect(cloudDocuments.get(`users/user-a/teams/${keep.id}`)).toMatchObject({
      activeCompetitionId: "league-2",
    });
    expect(loadTeams().map((saved) => saved.id)).toEqual([keep.id]);
  });
  it("reads from the primed cache and writes through to own library only", async () => {
    setTeamRepository(new CloudTeamRepository("user-a", [makeTeam("cloud1")]));

    expect(loadTeams().map((t) => t.id)).toEqual(["cloud1"]);

    saveTeams([makeTeam("cloud1"), makeTeam("cloud2")]);
    await flush();

    // Cache serves reads synchronously
    expect(loadTeams().map((t) => t.id)).toEqual(["cloud1", "cloud2"]);
    // Every write lands under this user's path
    const paths = setDocMock.mock.calls.map(
      (call) => (call[0] as unknown as { path: string }).path
    );
    expect(paths).toEqual([
      "users/user-a/teams/cloud1",
      "users/user-a/teams/cloud2",
    ]);
    // Nothing touched localStorage
    expect(localStorage.getItem("bloodbowl_teams")).toBeNull();
  });

  it("deletes removed teams from the cloud", async () => {
    setTeamRepository(
      new CloudTeamRepository("user-a", [makeTeam("keep"), makeTeam("drop")])
    );

    saveTeams([makeTeam("keep"), makeTeam("drop")]);
    await flush();

    saveTeams([makeTeam("keep")]);
    await flush();

    expect([...cloudDocuments.keys()]).toEqual(["users/user-a/teams/keep"]);
  });
});

describe("local→cloud migration", () => {
  it("uploads local teams once, deduplicated against cloud ids", async () => {
    localStorage.setItem(
      "bloodbowl_teams",
      JSON.stringify([makeTeam("local1"), makeTeam("shared")])
    );

    const uploaded = await migrateLocalTeams(
      "user-a",
      [makeTeam("shared")], // already in cloud — must not be overwritten
      () => true
    );

    expect(uploaded.map((t) => t.id)).toEqual(["local1"]);
    expect(setDocMock).toHaveBeenCalledTimes(1);
    expect(
      (setDocMock.mock.calls[0][0] as unknown as { path: string }).path
    ).toBe("users/user-a/teams/local1");

    // Second sign-in: flag set, nothing re-offered — idempotent
    const again = await migrateLocalTeams("user-a", [], () => true);
    expect(again).toEqual([]);
    expect(setDocMock).toHaveBeenCalledTimes(1);
  });

  it("declining uploads nothing and leaves local teams intact", async () => {
    localStorage.setItem(
      "bloodbowl_teams",
      JSON.stringify([makeTeam("local1")])
    );

    const uploaded = await migrateLocalTeams("user-b", [], () => false);

    expect(uploaded).toEqual([]);
    expect(setDocMock).not.toHaveBeenCalled();
    expect(JSON.parse(localStorage.getItem("bloodbowl_teams")!)).toHaveLength(
      1
    );
  });
});
