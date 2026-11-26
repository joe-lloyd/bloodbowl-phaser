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
import { useTeamLibrary } from "../../../src/ui/hooks/useTeamLibrary";
import { holdTeamSave } from "../../../src/ui/hooks/teamSaveLock";
import { commitTeam } from "../../../src/ui/components/hud/commitPlayerChange";
import { type Team } from "../../../src/types/Team";
import { TeamBuilder as TeamTestBuilder } from "../../utils/test-builders";

describe("TeamBuilder loading a team from its route", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    localStorage.clear();
    container = document.createElement("div");
    document.body.append(container);
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
    expect(fixtureValue(library.saves[0]).map((team) => team.id)).toEqual([
      "cloud-humans",
    ]);
    expect(fixtureValue(fixtureValue(library.saves[0])[0]).name).toBe(
      "Cloud Humans"
    );
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
      fixtureValue(library.saves[0]).map((team) => [
        team.id,
        team.name,
        team.players.length,
      ])
    ).toEqual([["cloud-humans", "Cloud Humans", 4]]);
  });

  it("still starts a new team from the new-team route", async () => {
    await renderRoute("/build-team/new-team");

    expect(container.textContent).toContain("CHOOSE YOUR TEAM");
  });

  async function duringRejectedSave(open: () => Promise<void>) {
    const accepted = savedHumans();
    const { library, repository } = cloudLibrary([
      { ...accepted, name: "Rejected Humans" },
    ]);
    setTeamRepository(repository);
    let reject: () => void = () => undefined;
    const saving = holdTeamSave(
      () =>
        new Promise((_, fail) => {
          reject = () => {
            library.teams = [accepted];
            fail(new Error("refused"));
          };
        })
    );
    await open();
    return () =>
      act(async () => {
        reject();
        await saving.catch(() => undefined);
      });
  }

  it("opens the accepted team once a save that is rejected has settled", async () => {
    const settle = await duringRejectedSave(() =>
      renderRoute("/build-team/cloud-humans")
    );
    expect(container.querySelectorAll("input")).toHaveLength(0);
    await settle();
    expect(teamNameField()).toBeDefined();
  });

  it("drops a rejected save from a library opened while it was pending", async () => {
    const Library = () =>
      useTeamLibrary()[0]
        .map(({ name }) => name)
        .join(',');
    const settle = await duringRejectedSave(() => {
      act(() => {
        root.render(<Library />);
      });
      return Promise.resolve();
    });
    expect(container.textContent).toBe("Rejected Humans");
    await settle();
    expect(container.textContent).toBe("Cloud Humans");
  });

  it("keeps a saved change when only another team's write fails", async () => {
    const humans = savedHumans();
    const { library, repository } = cloudLibrary([humans]);
    setTeamRepository({
      ...repository,
      saveTeams: (next) => {
        library.teams = [...next];
        return Promise.reject(new Error("another team was refused"));
      },
    });
    const shown = structuredClone(humans);
    await commitTeam(shown, { ...structuredClone(humans), name: "Renamed" });
    expect(shown.name).toBe("Renamed");
  });
});
