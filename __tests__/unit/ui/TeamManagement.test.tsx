import { act } from "react";
import { createRoot, Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TeamManagement } from "../../../src/ui/components/pages/TeamManagement";
import { saveTeams } from "../../../src/game/managers/TeamManager";
import { TeamBuilder as TeamTestBuilder } from "../../utils/test-builders";

/**
 * team-management-layout: "Team overview cards show the per-team stats
 * summary" — the Team Value / Treasury / Roster / Record grid is back on
 * the overview card (reversing the earlier redesign-team-management-pages
 * decision). Per-player career statistics moved the other way: off the
 * overview and onto the team detail page's roster table, so the overview
 * no longer renders that block.
 */
describe("TeamManagement overview card", () => {
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

  it("renders the Team Value/Treasury/Roster/Record stats grid", async () => {
    const team = new TeamTestBuilder()
      .withName("The Overview Orcs")
      .withPlayers(3)
      .withTreasury(60000)
      .withStats(4, 1, 2)
      .build();
    saveTeams([team]);

    await act(async () => {
      root.render(
        <MemoryRouter>
          <TeamManagement />
        </MemoryRouter>
      );
    });

    expect(container.textContent).toContain("The Overview Orcs");
    expect(container.textContent).toContain("Team Value");
    expect(container.textContent).toContain("Treasury");
    expect(container.textContent).toContain("60k");
    expect(container.textContent).toContain("3/11");
    expect(container.textContent).toContain("4-2-1");
  });

  it("does not render the Career statistics block", async () => {
    const team = new TeamTestBuilder()
      .withName("The Overview Orcs")
      .withPlayers(3)
      .build();
    saveTeams([team]);

    await act(async () => {
      root.render(
        <MemoryRouter>
          <TeamManagement />
        </MemoryRouter>
      );
    });

    expect(container.textContent).not.toContain("Career statistics");
  });
});
