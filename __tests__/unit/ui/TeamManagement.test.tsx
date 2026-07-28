import { act } from "react";
import { createRoot, Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TeamManagement } from "../../../src/ui/components/pages/TeamManagement";
import { saveTeams } from "../../../src/game/managers/TeamManager";
import { TeamBuilder as TeamTestBuilder } from "../../utils/test-builders";

/**
 * team-management-layout: "Overview card omits the stats grid" — the Team
 * Value / Treasury / Roster / Record grid moved to the team detail page
 * (TeamBuilder), so the overview card no longer renders it. The
 * career-statistics <details> block is a separate, per-player feature that
 * stays on the overview and must keep working.
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

  it("does not render the Team Value/Treasury/Roster/Record stats grid", async () => {
    const team = new TeamTestBuilder()
      .withName("The Overview Orcs")
      .withPlayers(3)
      .withTreasury(60000)
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
    expect(container.textContent).not.toContain("Team Value");
    expect(container.textContent).not.toContain("Treasury");
  });

  it("still renders the Career statistics details block", async () => {
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

    expect(container.textContent).toContain("Career statistics");
  });

  it("shows an advancement-mode pill for a team with a mode set", async () => {
    const team = new TeamTestBuilder()
      .withName("The Matched Play Marauders")
      .withPlayers(3)
      .build();
    team.advancementMode = "matched-play";
    saveTeams([team]);

    await act(async () => {
      root.render(
        <MemoryRouter>
          <TeamManagement />
        </MemoryRouter>
      );
    });

    expect(container.textContent).toContain("Matched Play");
  });

  it("shows no advancement-mode pill for a team without a mode", async () => {
    const team = new TeamTestBuilder()
      .withName("The Modeless Marauders")
      .withPlayers(3)
      .build();
    delete team.advancementMode;
    saveTeams([team]);

    await act(async () => {
      root.render(
        <MemoryRouter>
          <TeamManagement />
        </MemoryRouter>
      );
    });

    expect(container.querySelector('[title="Advancement mode"]')).toBeNull();
  });
});
