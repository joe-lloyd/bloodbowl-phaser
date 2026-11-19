import { fixtureValue } from "../../../src/testing/fixtureValue";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TeamBuilder } from "../../../src/ui/components/pages/TeamBuilder";
import {
  type TeamRepository,
  saveTeams,
  setTeamLibraryStatus,
  setTeamRepository,
} from "../../../src/game/managers/TeamManager";
import { type Team } from "../../../src/types/Team";
import { TeamBuilder as TeamTestBuilder } from "../../utils/test-builders";

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
    await act(async () => {
      root.unmount();
    });
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

  function cloudLibrary(teams: Team[]) {
    const library = { teams, saves: new Array<Team[]>() };
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
    expect(match, `Missing button ${String(label)}`).toBeDefined();
    return fixtureValue(match);
  }

  it("shows the requested team when the cloud library arrives after the page mounted", async () => {
    await renderRoute("/build-team/cloud-humans");

    const { repository } = cloudLibrary([savedHumans()]);
    await act(async () => {
      setTeamRepository(repository);
    });

    expect(container.textContent).not.toContain("CHOOSE YOUR TEAM");
    expect(container.textContent).toContain("Draft team · Human");
    expect(teamNameField()).toBeDefined();
    expect(container.textContent).toContain("4/11");
  });

  it("waits for a library that is still arriving instead of starting another team", async () => {
    setTeamLibraryStatus("loading");
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

    await act(async () => {
      button(/Back to Teams/).click();
    });
    expect(container.textContent).toContain("Team management");
  });

  it("saves the late-arriving team over the original, keeping its ID", async () => {
    setTeamLibraryStatus("loading");
    await renderRoute("/build-team/cloud-humans");
    const { library, repository } = cloudLibrary([savedHumans()]);
    await act(async () => {
      setTeamRepository(repository);
    });

    await act(async () => {
      button(/Save Team/).click();
    });

    expect(library.saves).toHaveLength(1);
    expect(fixtureValue(library.saves[0]).map((team) => team.id)).toEqual(["cloud-humans"]);
    expect(fixtureValue(fixtureValue(library.saves[0])[0]).name).toBe("Cloud Humans");
    expect(container.textContent).toContain("Team management");
  });

  it("waits for the cloud copy instead of editing an older local copy of the same team", async () => {
    const staleLocal = new TeamTestBuilder()
      .withId("cloud-humans")
      .withName("Stale Local Humans")
      .withPlayers(2)
      .build();
    saveTeams([staleLocal]);
    setTeamLibraryStatus("loading");
    await renderRoute("/build-team/cloud-humans");

    expect(container.textContent).toContain("Loading team");
    expect(
      [...container.querySelectorAll("input")].some(
        (input) => input.value === "Stale Local Humans"
      )
    ).toBe(false);
    expect(container.textContent).not.toContain("Save Team");

    const { library, repository } = cloudLibrary([savedHumans()]);
    await act(async () => {
      setTeamRepository(repository);
    });
    expect(teamNameField()).toBeDefined();
    expect(container.textContent).toContain("4/11");

    await act(async () => {
      button(/Save Team/).click();
    });
    expect(library.saves).toHaveLength(1);
    expect(
      fixtureValue(library.saves[0]).map((team) => [team.id, team.name, team.players.length])
    ).toEqual([["cloud-humans", "Cloud Humans", 4]]);
  });

  it("still starts a new team from the new-team route", async () => {
    await renderRoute("/build-team/new-team");

    expect(container.textContent).toContain("CHOOSE YOUR TEAM");
  });
});
