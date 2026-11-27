import { fixtureValue } from "../../../src/testing/fixtureValue";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dehydrateTeam } from "../../../src/data/persistence/teamPersistence";
import { type Team } from "../../../src/types/Team";
import { TeamBuilder as TeamTestBuilder } from "../../utils/test-builders";

const auth = vi.hoisted(() => {
  const state: { listener: ((user: unknown) => void) | null } = { listener: null };
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
  isAuthResolved: () => true,
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

const setDoc = vi.hoisted(() =>
  vi.fn<[unknown, unknown], Promise<void>>(() => Promise.resolve())
);

vi.mock("firebase/firestore", () => ({
  collection: vi.fn(() => ({})),
  collectionGroup: vi.fn(),
  doc: vi.fn(() => ({})),
  runTransaction: vi.fn(
    (_db: unknown, run: (transaction: unknown) => Promise<void>) =>
      run({
        get: () =>
          Promise.resolve({
            exists: () => true,
            data: () => dehydrateTeam(humans("Cloud Humans", 4)),
          }),
        set: setDoc,
      })
  ),
  setDoc,
  getDocsFromServer: vi.fn(
    () =>
      new Promise((resolve, reject) => {
        fetches.push({ resolve, reject });
      })
  ),
}));

import { TeamBuilder } from "../../../src/ui/components/pages/TeamBuilder";
import { TeamManagement } from "../../../src/ui/components/pages/TeamManagement";
import { TeamLibraryGate } from "../../../src/ui/components/TeamManagement/TeamLibraryGate";
import {
  getLocalRepository,
  loadTeams,
  setTeamLibraryStatus,
  setTeamRepository,
} from "../../../src/game/managers/TeamManager";
import { connectTeamPersistenceToAuth } from "../../../src/firebase/cloudTeamRepository";

function humans(name: string, players: number): Team {
  return new TeamTestBuilder()
    .withId("cloud-humans")
    .withName(name)
    .withPlayers(players)
    .build();
}

async function failSignedInLoad() {
  getLocalRepository().saveTeams([humans("Stale Local Humans", 2)]);
  connectTeamPersistenceToAuth(() => false);
  fixtureValue(auth.listener)({ uid: "coach-1" });
  await act(async () => {
    fixtureValue(fetches[0]).reject(new Error("offline"));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return localStorage.getItem("bloodbowl_teams");
}

describe("Edit Team when the signed-in library fails to load", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    localStorage.clear();
    fetches.length = 0;
    vi.spyOn(console, "error").mockImplementation(() => {});
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    setTeamRepository(null);
    vi.restoreAllMocks();
    localStorage.clear();
  });


  async function render(path: string) {
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/" element={<p>Main menu</p>} />
            <Route
              path="/build-team"
              element={
                <TeamLibraryGate>
                  <TeamManagement />
                </TeamLibraryGate>
              }
            />
            <Route
              path="/build-team/:teamId"
              element={
                <TeamLibraryGate>
                  <TeamBuilder />
                </TeamLibraryGate>
              }
            />
          </Routes>
        </MemoryRouter>
      );
    });
  }

  async function editTeamName(from: string, to: string) {
    const input = fixtureValue([...container.querySelectorAll("input")].find(
      (candidate) => candidate.value === from
    ));
    const setValue = fixtureValue(fixtureValue(Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    )).set);
    await act(async () => {
      setValue.call(input, to);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }

  function inputValues(): string[] {
    return [...container.querySelectorAll("input")].map((input) => input.value);
  }

  function button(label: RegExp): HTMLButtonElement {
    const match = [...container.querySelectorAll("button")].find((b) =>
      label.test(b.textContent ?? "")
    );
    expect(match, `Missing button ${String(label)}`).toBeDefined();
    return fixtureValue(match);
  }

  it("does not open or save an older local copy with the same ID", async () => {
    const localBefore = await failSignedInLoad();
    await render("/build-team/cloud-humans");

    expect(container.textContent).toContain("Couldn't load your teams");
    expect(inputValues()).not.toContain("Stale Local Humans");
    expect(container.textContent).not.toContain("Save Team");
    expect(container.textContent).not.toContain("Team not found");
    expect(localStorage.getItem("bloodbowl_teams")).toBe(localBefore);
  });

  it("opens the coach's own copy when Retry loads their library", async () => {
    const localBefore = await failSignedInLoad();
    await render("/build-team/cloud-humans");

    await act(async () => {
      button(/^Retry$/).click();
    });
    expect(container.textContent).toContain("Loading your teams");
    expect(inputValues()).not.toContain("Stale Local Humans");
    expect(fetches).toHaveLength(2);
    await act(async () => {
      fixtureValue(fetches[1]).resolve({
        docs: [{ data: () => dehydrateTeam(humans("Cloud Humans", 4)) }],
      });
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(inputValues()).toContain("Cloud Humans");
    expect(container.textContent).toContain("4/11");
    await editTeamName("Cloud Humans", "Cloud Humans edited");
    setDoc.mockClear();
    await act(async () => {
      button(/Save Team/).click();
    });

    const cloudWrites = vi
      .mocked(setDoc)
      .mock.calls.map(([, data]) => data);
    expect(cloudWrites).toContainEqual(
      expect.objectContaining({
        id: "cloud-humans",
        name: "Cloud Humans edited",
      })
    );
    expect(loadTeams().map((team) => [team.id, team.name])).toEqual([
      ["cloud-humans", "Cloud Humans edited"],
    ]);
    expect(localStorage.getItem("bloodbowl_teams")).toBe(localBefore);
  });

  it("shows Team Management the failure instead of the local teams", async () => {
    await failSignedInLoad();
    await render("/build-team");

    expect(container.textContent).toContain("Couldn't load your teams");
    expect(container.textContent).not.toContain("Stale Local Humans");
    expect(button(/^Retry$/)).toBeDefined();
  });

  it("keeps the local teams hidden while Retry reloads the library", async () => {
    await failSignedInLoad();
    await render("/build-team");

    await act(async () => {
      button(/^Retry$/).click();
    });

    expect(container.textContent).toContain("Loading your teams");
    expect(container.textContent).not.toContain("Stale Local Humans");
    expect(container.textContent).not.toContain("No teams found");
  });
});

describe("Team Management seed actions while the library is not loaded", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    localStorage.clear();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    setTeamRepository(null);
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it.each([
    ["Seed All Rosters", /still loading/],
    ["Delete Seed Teams", /could not be loaded/],
  ])("%s says why and changes nothing", async (label, message) => {
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={["/build-team"]}>
          <Routes>
            <Route path="/build-team" element={<TeamManagement />} />
          </Routes>
        </MemoryRouter>
      );
    });

    await act(async () => {
      setTeamLibraryStatus(label === "Seed All Rosters" ? "loading" : "failed");
    });
    const before = JSON.stringify({ ...localStorage });
    const confirmSpy = vi.spyOn(globalThis, "confirm").mockReturnValue(true);
    const alertSpy = vi.spyOn(globalThis, "alert").mockImplementation(() => {});

    const seedButton = fixtureValue([...container.querySelectorAll("button")].find(
      (b) => b.textContent === label
    ));
    await act(async () => {
      seedButton.click();
    });

    expect(confirmSpy).not.toHaveBeenCalled();
    expect(alertSpy).toHaveBeenCalledWith(expect.stringMatching(message));
    expect(JSON.stringify({ ...localStorage })).toBe(before);
  });
});
