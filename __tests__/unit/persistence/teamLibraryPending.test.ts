/**
 * The team library is "pending" while a signed-in coach's cloud teams may
 * still replace the localStorage library: while the session restores after
 * a refresh, and while the cloud fetch is in flight. Pages that look a team
 * up by ID wait on it instead of deciding the team does not exist. Only the
 * latest auth change's load may install a library or settle the state.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dehydrateTeam } from "../../../src/data/persistence/teamPersistence";
import { Team } from "../../../src/types/Team";
import { TeamBuilder as TeamTestBuilder } from "../../utils/test-builders";

const auth = vi.hoisted(() => ({
  resolved: false,
  listener: null as null | ((user: unknown) => void),
}));
/** Every cloud fetch, in the order they started, each settled by hand. */
const fetches = vi.hoisted(
  () =>
    [] as {
      resolve: (snapshot: unknown) => void;
      reject: (error: unknown) => void;
    }[]
);

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
        fetches.push({ resolve, reject });
      })
  ),
}));

import {
  isTeamLibraryPending,
  loadTeams,
  setTeamRepository,
} from "../../../src/game/managers/TeamManager";
import { connectTeamPersistenceToAuth } from "../../../src/firebase/cloudTeamRepository";

function cloudTeam(id: string): Team {
  return new TeamTestBuilder().withId(id).withName(id).build();
}

function snapshotOf(...teams: Team[]) {
  return { docs: teams.map((team) => ({ data: () => dehydrateTeam(team) })) };
}

/** Let the awaited fetch and migration callbacks run. */
function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("team library pending", () => {
  beforeEach(() => {
    localStorage.clear();
    auth.resolved = false;
    auth.listener = null;
    fetches.length = 0;
  });

  afterEach(() => {
    setTeamRepository(null);
    vi.restoreAllMocks();
    localStorage.clear();
  });

  function signIn(uid: string) {
    auth.resolved = true;
    auth.listener!({ uid });
  }

  function signOut() {
    auth.resolved = true;
    auth.listener!(null);
  }

  it("is pending while the session restores, and settles signed out", () => {
    connectTeamPersistenceToAuth(() => false);
    expect(isTeamLibraryPending()).toBe(true);

    signOut();
    expect(isTeamLibraryPending()).toBe(false);
  });

  it("stays pending until the signed-in coach's cloud library is installed", async () => {
    connectTeamPersistenceToAuth(() => false);
    signIn("coach-1");
    expect(isTeamLibraryPending()).toBe(true);

    fetches[0].resolve(snapshotOf(cloudTeam("cloud-team")));
    await vi.waitFor(() => expect(isTeamLibraryPending()).toBe(false));
    expect(loadTeams().map((t) => t.id)).toEqual(["cloud-team"]);
  });

  it("settles when the cloud library cannot be loaded", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    connectTeamPersistenceToAuth(() => false);
    signIn("coach-1");
    expect(isTeamLibraryPending()).toBe(true);

    fetches[0].reject(new Error("offline"));
    await vi.waitFor(() => expect(isTeamLibraryPending()).toBe(false));
  });

  it("does not let an earlier sign-in's failed fetch settle a newer load", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    connectTeamPersistenceToAuth(() => false);
    signIn("coach-a");
    signOut();
    signIn("coach-b");
    expect(fetches).toHaveLength(2);

    fetches[0].reject(new Error("coach A's fetch failed late"));
    await settle();
    expect(isTeamLibraryPending()).toBe(true);

    fetches[1].resolve(snapshotOf(cloudTeam("b-team")));
    await vi.waitFor(() => expect(isTeamLibraryPending()).toBe(false));
    expect(loadTeams().map((t) => t.id)).toEqual(["b-team"]);
  });

  it("does not install an earlier sign-in's library over a newer one", async () => {
    connectTeamPersistenceToAuth(() => false);
    signIn("coach-a");
    signOut();
    signIn("coach-b");

    fetches[1].resolve(snapshotOf(cloudTeam("b-team")));
    await vi.waitFor(() => expect(isTeamLibraryPending()).toBe(false));
    fetches[0].resolve(snapshotOf(cloudTeam("a-team")));
    await settle();

    expect(loadTeams().map((t) => t.id)).toEqual(["b-team"]);
  });

  it("keeps a signed-out coach on the local library when a sign-in fetch lands late", async () => {
    connectTeamPersistenceToAuth(() => false);
    signIn("coach-a");
    signOut();
    expect(isTeamLibraryPending()).toBe(false);

    fetches[0].resolve(snapshotOf(cloudTeam("a-team")));
    await settle();

    expect(isTeamLibraryPending()).toBe(false);
    expect(loadTeams()).toEqual([]);
  });
});
