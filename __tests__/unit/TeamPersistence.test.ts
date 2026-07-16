/**
 * Team persistence backends: signed-out localStorage, signed-in cloud
 * write-through cache, and the one-time local→cloud migration.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { Team } from "../../src/types/Team";

// Mock the Firestore SDK surface used by cloudTeamRepository. Refs encode
// their path so assertions can check which user's library was touched.
vi.mock("firebase/firestore", () => ({
  collection: vi.fn((_db: unknown, ...path: string[]) => ({
    path: path.join("/"),
  })),
  doc: vi.fn((col: { path: string }, id: string) => ({
    path: `${col.path}/${id}`,
  })),
  setDoc: vi.fn(() => Promise.resolve()),
  deleteDoc: vi.fn(() => Promise.resolve()),
  getDocs: vi.fn(() => Promise.resolve({ docs: [] })),
}));

vi.mock("../../src/firebase/config", () => ({
  getDb: vi.fn(() => ({})),
  isFirebaseConfigured: vi.fn(() => true),
}));

import { setDoc, deleteDoc } from "firebase/firestore";
import {
  saveTeams,
  loadTeams,
  setTeamRepository,
} from "../../src/game/managers/TeamManager";
import {
  CloudTeamRepository,
  migrateLocalTeams,
} from "../../src/firebase/cloudTeamRepository";

const setDocMock = vi.mocked(setDoc);
const deleteDocMock = vi.mocked(deleteDoc);

function makeTeam(id: string, name = id): Team {
  return { id, name, players: [] } as unknown as Team;
}

/** Let the repository's fire-and-forget Firestore writes settle. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  localStorage.clear();
  setTeamRepository(null);
  vi.clearAllMocks();
});

describe("signed-out persistence", () => {
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

    saveTeams([makeTeam("keep")]);
    await flush();

    expect(
      deleteDocMock.mock.calls.map(
        (call) => (call[0] as unknown as { path: string }).path
      )
    ).toEqual(["users/user-a/teams/drop"]);
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
