/**
 * The team library is "pending" while a signed-in coach's cloud teams may
 * still replace the localStorage library: while the session restores after
 * a refresh, and while the cloud fetch is in flight. Pages that look a team
 * up by ID wait on it instead of deciding the team does not exist.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dehydrateTeam } from "../../../src/data/persistence/teamPersistence";
import { TeamBuilder as TeamTestBuilder } from "../../utils/test-builders";

const auth = vi.hoisted(() => ({
  resolved: false,
  listener: null as null | ((user: unknown) => void),
}));
const fetch = vi.hoisted(() => ({
  resolve: null as null | ((snapshot: unknown) => void),
  reject: null as null | ((error: unknown) => void),
}));

vi.mock("../../../src/firebase/auth", () => ({
  isAuthResolved: () => auth.resolved,
  subscribeToAuth: (listener: (user: unknown) => void) => {
    auth.listener = listener;
    listener(null);
    return () => {};
  },
}));

vi.mock("../../../src/firebase/config", () => ({
  getDb: vi.fn(() => ({})),
  isFirebaseConfigured: vi.fn(() => true),
}));

vi.mock("firebase/firestore", () => ({
  collection: vi.fn(() => ({})),
  collectionGroup: vi.fn(),
  doc: vi.fn(),
  runTransaction: vi.fn(),
  setDoc: vi.fn(),
  getDocs: vi.fn(
    () =>
      new Promise((resolve, reject) => {
        fetch.resolve = resolve;
        fetch.reject = reject;
      })
  ),
}));

import {
  isTeamLibraryPending,
  loadTeams,
  setTeamRepository,
} from "../../../src/game/managers/TeamManager";
import { connectTeamPersistenceToAuth } from "../../../src/firebase/cloudTeamRepository";

const signedIn = { uid: "coach-1" };

describe("team library pending", () => {
  beforeEach(() => {
    localStorage.clear();
    auth.resolved = false;
    auth.listener = null;
    fetch.resolve = null;
    fetch.reject = null;
  });

  afterEach(() => {
    setTeamRepository(null);
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("is pending while the session restores, and settles signed out", () => {
    connectTeamPersistenceToAuth(() => false);
    expect(isTeamLibraryPending()).toBe(true);

    auth.resolved = true;
    auth.listener!(null);
    expect(isTeamLibraryPending()).toBe(false);
  });

  it("stays pending until the signed-in coach's cloud library is installed", async () => {
    connectTeamPersistenceToAuth(() => false);
    auth.resolved = true;
    auth.listener!(signedIn);
    expect(isTeamLibraryPending()).toBe(true);

    const team = new TeamTestBuilder()
      .withId("cloud-team")
      .withName("Cloud Team")
      .build();
    fetch.resolve!({ docs: [{ data: () => dehydrateTeam(team) }] });
    await vi.waitFor(() => expect(isTeamLibraryPending()).toBe(false));
    expect(loadTeams().map((t) => t.id)).toEqual(["cloud-team"]);
  });

  it("settles when the cloud library cannot be loaded", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    connectTeamPersistenceToAuth(() => false);
    auth.resolved = true;
    auth.listener!(signedIn);
    expect(isTeamLibraryPending()).toBe(true);

    fetch.reject!(new Error("offline"));
    await vi.waitFor(() => expect(isTeamLibraryPending()).toBe(false));
  });
});
