import { fixtureValue } from "../../../src/testing/fixtureValue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dehydrateTeam } from "../../../src/data/persistence/teamPersistence";
import { type Team } from "../../../src/types/Team";
import { TeamBuilder as TeamTestBuilder } from "../../utils/test-builders";

const auth = vi.hoisted(() => {
  const state: {
    resolved: boolean;
    listener: ((user: unknown) => void) | null;
  } = { resolved: false, listener: null };
  return state;
});

const fetches = vi.hoisted(
  () =>
    new Array<{
      resolve: (snapshot: unknown) => void;
      reject: (error: unknown) => void;
    }>()
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
  TeamLibraryUnavailableError,
  getLocalRepository,
  getTeamLibraryStatus,
  isTeamLibraryPending,
  loadTeams,
  retryTeamLibrary,
  saveTeams,
  setTeamRepository,
} from "../../../src/game/managers/TeamManager";
import { connectTeamPersistenceToAuth } from "../../../src/firebase/cloudTeamRepository";

function cloudTeam(id: string): Team {
  return new TeamTestBuilder().withId(id).withName(id).build();
}

function snapshotOf(...teams: Team[]) {
  return { docs: teams.map((team) => ({ data: () => dehydrateTeam(team) })) };
}

function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function signIn(uid: string) {
  auth.resolved = true;
  fixtureValue(auth.listener)({ uid });
}

function signOut() {
  auth.resolved = true;
  fixtureValue(auth.listener)(null);
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

    fixtureValue(fetches[0]).resolve(snapshotOf(cloudTeam("cloud-team")));
    await vi.waitFor(() => {
      expect(isTeamLibraryPending()).toBe(false);
    });
    expect(loadTeams().map((t) => t.id)).toEqual(["cloud-team"]);
  });

  it("marks the library failed, not loaded, when the cloud library cannot be loaded", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    connectTeamPersistenceToAuth(() => false);
    signIn("coach-1");
    expect(getTeamLibraryStatus()).toBe("loading");

    fixtureValue(fetches[0]).reject(new Error("offline"));
    await vi.waitFor(() => {
      expect(getTeamLibraryStatus()).toBe("failed");
    });
    expect(isTeamLibraryPending()).toBe(false);
  });

  it("neither shows nor saves to the local library after a signed-in load failed", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    getLocalRepository().saveTeams([cloudTeam("same-id")]);
    const localBefore = localStorage.getItem("bloodbowl_teams");
    connectTeamPersistenceToAuth(() => false);
    signIn("coach-1");
    fixtureValue(fetches[0]).reject(new Error("offline"));
    await vi.waitFor(() => {
      expect(getTeamLibraryStatus()).toBe("failed");
    });

    expect(loadTeams()).toEqual([]);
    await expect(saveTeams([cloudTeam("same-id")])).rejects.toBeInstanceOf(
      TeamLibraryUnavailableError
    );
    expect(localStorage.getItem("bloodbowl_teams")).toBe(localBefore);
  });

  it("loads the coach's library when Retry follows a failed load", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    connectTeamPersistenceToAuth(() => false);
    signIn("coach-1");
    fixtureValue(fetches[0]).reject(new Error("offline"));
    await vi.waitFor(() => {
      expect(getTeamLibraryStatus()).toBe("failed");
    });

    retryTeamLibrary();
    expect(getTeamLibraryStatus()).toBe("loading");
    expect(fetches).toHaveLength(2);
    fixtureValue(fetches[1]).resolve(snapshotOf(cloudTeam("cloud-team")));
    await vi.waitFor(() => {
      expect(getTeamLibraryStatus()).toBe("loaded");
    });
    expect(loadTeams().map((t) => t.id)).toEqual(["cloud-team"]);
  });

  it("does not reload the library when auth reports the same account again", async () => {
    connectTeamPersistenceToAuth(() => false);
    signIn("coach-1");
    fixtureValue(fetches[0]).resolve(snapshotOf(cloudTeam("cloud-team")));
    await vi.waitFor(() => {
      expect(getTeamLibraryStatus()).toBe("loaded");
    });

    signIn("coach-1");

    expect(getTeamLibraryStatus()).toBe("loaded");
    expect(fetches).toHaveLength(1);
    expect(loadTeams().map((t) => t.id)).toEqual(["cloud-team"]);
  });

  it("does not restart an in-flight load when auth reports the same account", async () => {
    connectTeamPersistenceToAuth(() => false);
    signIn("coach-1");
    signIn("coach-1");
    expect(fetches).toHaveLength(1);

    fixtureValue(fetches[0]).resolve(snapshotOf(cloudTeam("cloud-team")));
    await vi.waitFor(() => {
      expect(getTeamLibraryStatus()).toBe("loaded");
    });
  });

  it("has nothing to retry once signed out", () => {
    connectTeamPersistenceToAuth(() => false);
    signOut();
    retryTeamLibrary();
    expect(fetches).toHaveLength(0);
    expect(getTeamLibraryStatus()).toBe("loaded");
  });

  it("does not let an earlier sign-in's failed fetch settle a newer load", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    connectTeamPersistenceToAuth(() => false);
    signIn("coach-a");
    signOut();
    signIn("coach-b");
    expect(fetches).toHaveLength(2);

    fixtureValue(fetches[0]).reject(new Error("coach A's fetch failed late"));
    await settle();
    expect(isTeamLibraryPending()).toBe(true);

    fixtureValue(fetches[1]).resolve(snapshotOf(cloudTeam("b-team")));
    await vi.waitFor(() => {
      expect(isTeamLibraryPending()).toBe(false);
    });
    expect(loadTeams().map((t) => t.id)).toEqual(["b-team"]);
  });

  it("does not install an earlier sign-in's library over a newer one", async () => {
    connectTeamPersistenceToAuth(() => false);
    signIn("coach-a");
    signOut();
    signIn("coach-b");

    fixtureValue(fetches[1]).resolve(snapshotOf(cloudTeam("b-team")));
    await vi.waitFor(() => {
      expect(isTeamLibraryPending()).toBe(false);
    });
    fixtureValue(fetches[0]).resolve(snapshotOf(cloudTeam("a-team")));
    await settle();

    expect(loadTeams().map((t) => t.id)).toEqual(["b-team"]);
  });

  it("keeps a signed-out coach on the local library when a sign-in fetch lands late", async () => {
    connectTeamPersistenceToAuth(() => false);
    signIn("coach-a");
    signOut();
    expect(isTeamLibraryPending()).toBe(false);

    fixtureValue(fetches[0]).resolve(snapshotOf(cloudTeam("a-team")));
    await settle();

    expect(isTeamLibraryPending()).toBe(false);
    expect(loadTeams()).toEqual([]);
  });
});
