import { act } from "react";
import { createRoot, Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TeamBuilder } from "../../../src/ui/components/pages/TeamBuilder";
import {
  TeamRepository,
  setTeamLibraryPending,
  setTeamRepository,
} from "../../../src/game/managers/TeamManager";
import { Team } from "../../../src/types/Team";
import { TeamBuilder as TeamTestBuilder } from "../../utils/test-builders";

/**
 * Edit Team after a refresh: a signed-in coach's cloud library arrives a
 * moment after the page mounts. The page used to read the library once,
 * miss the team, and start a brand-new (Amazon, later roster-picker) team
 * in its place, with a fresh ID.
 */
describe("TeamBuilder loading a team from its route", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    localStorage.clear();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    setTeamRepository(null);
    await act(async () => root.unmount());
    container.remove();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  function savedHumans(): Team {
    return new TeamTestBuilder()
      .withId("cloud-humans")
      .withName("Cloud Humans")
      .withPlayers(4)
      .build();
  }

  /** A cloud library: a cache that answers synchronously once primed. */
  function cloudLibrary(teams: Team[]) {
    const library = { teams, saves: [] as Team[][] };
    const repository: TeamRepository = {
      loadTeams: () => library.teams,
      saveTeams: (next) => {
        library.teams = [...next];
        library.saves.push([...next]);
      },
      deleteTeam: () => {},
    };
    return { library, repository };
  }

  async function renderRoute(path: string) {
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/build-team" element={<p>Team management</p>} />
            <Route path="/build-team/new-team" element={<TeamBuilder />} />
            <Route path="/build-team/:teamId" element={<TeamBuilder />} />
          </Routes>
        </MemoryRouter>
      );
    });
  }

  function teamNameField(): HTMLInputElement | undefined {
    return [...container.querySelectorAll("input")].find(
      (input) => input.value === "Cloud Humans"
    );
  }

  function button(label: RegExp): HTMLButtonElement {
    const match = [...container.querySelectorAll("button")].find((b) =>
      label.test(b.textContent ?? "")
    );
    expect(match, `Missing button ${label}`).toBeDefined();
    return match!;
  }

  it("shows the requested team when the cloud library arrives after the page mounted", async () => {
    await renderRoute("/build-team/cloud-humans");

    const { repository } = cloudLibrary([savedHumans()]);
    await act(async () => setTeamRepository(repository));

    expect(container.textContent).not.toContain("CHOOSE YOUR TEAM");
    expect(container.textContent).toContain("Draft team · Human");
    expect(teamNameField()).toBeDefined();
    expect(container.textContent).toContain("4/11");
  });

  it("waits for a library that is still arriving instead of starting another team", async () => {
    setTeamLibraryPending(true);
    await renderRoute("/build-team/cloud-humans");

    expect(container.textContent).toContain("Loading team");
    expect(container.textContent).not.toContain("CHOOSE YOUR TEAM");
    expect(container.textContent).not.toContain("Amazon");
    expect(container.textContent).not.toContain("Team not found");
  });

  it("says the team is missing once the library has settled, and starts nothing", async () => {
    await renderRoute("/build-team/deleted-team");

    expect(container.textContent).toContain("Team not found");
    expect(container.textContent).not.toContain("CHOOSE YOUR TEAM");
    expect(container.textContent).not.toContain("Amazon");
    expect(localStorage.getItem("bloodbowl_teams")).toBeNull();

    await act(async () => button(/Back to Team Management/).click());
    expect(container.textContent).toContain("Team management");
  });

  it("saves the late-arriving team over the original, keeping its ID", async () => {
    setTeamLibraryPending(true);
    await renderRoute("/build-team/cloud-humans");
    const { library, repository } = cloudLibrary([savedHumans()]);
    await act(async () => setTeamRepository(repository));

    await act(async () => button(/Save Team/).click());

    expect(library.saves).toHaveLength(1);
    expect(library.saves[0].map((team) => team.id)).toEqual(["cloud-humans"]);
    expect(library.saves[0][0].name).toBe("Cloud Humans");
    expect(container.textContent).toContain("Team management");
  });

  it("still starts a new team from the new-team route", async () => {
    await renderRoute("/build-team/new-team");

    expect(container.textContent).toContain("CHOOSE YOUR TEAM");
  });
});
