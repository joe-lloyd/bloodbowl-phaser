import { act } from "react";
import { createRoot, Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TeamBuilder } from "../../../src/ui/components/pages/TeamBuilder";
import { saveTeams } from "../../../src/game/managers/TeamManager";
import { TeamBuilder as TeamTestBuilder } from "../../utils/test-builders";

/**
 * team-management-layout: "Detail page shows the stats grid" — TeamBuilder
 * (the /build-team/:teamId detail page) renders TeamStatsOverview near its
 * existing TV: badge, now that the overview card no longer shows it.
 */
describe("TeamBuilder detail page", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    localStorage.clear();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    localStorage.clear();
  });

  it("renders the Team Value/Treasury/Roster/Record stats grid for the loaded team", async () => {
    const team = new TeamTestBuilder()
      .withId("detail-team-1")
      .withName("The Detail Dwarfs")
      .withPlayers(4)
      .withTreasury(90000)
      .withStats(2, 0, 1)
      .build();
    saveTeams([team]);

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={[`/build-team/${team.id}`]}>
          <Routes>
            <Route path="/build-team/:teamId" element={<TeamBuilder />} />
          </Routes>
        </MemoryRouter>
      );
    });

    expect(container.textContent).toContain("Team Value");
    expect(container.textContent).toContain("Roster");
    expect(container.textContent).toContain("4/11");
    expect(container.textContent).toContain("2-1-0");
  });
});
