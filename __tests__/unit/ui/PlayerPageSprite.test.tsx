import { act } from "react";
import { createRoot, Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PlayerPage } from "../../../src/ui/components/pages/PlayerPage";
import { saveTeams } from "../../../src/game/managers/TeamManager";
import { getRosterByRosterName } from "../../../src/data/RosterTemplates";
import { modelFor } from "../../../src/game/presentation/playerArt";
import { createPlayer } from "../../../src/types/Player";
import {
  calculateTeamValue,
  createTeam,
  RosterName,
} from "../../../src/types/Team";

/**
 * The player page shows the player's own match sprite, large: the model
 * their position uses in the match, fitted by whole pixels, in a panel
 * ruled in the team's primary colour.
 */
describe("PlayerPage sprite", () => {
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

  async function openPlayer(rosterName: RosterName, positionName: string) {
    const roster = getRosterByRosterName(rosterName);
    const team = createTeam(
      "Sprite Test",
      rosterName,
      { primary: 0x8e1b1b, secondary: 0xffffff },
      roster.rerollCost
    );
    team.players = roster.playerTemplates.map((template, index) =>
      createPlayer(template, team.id, index + 1)
    );
    team.teamValue = calculateTeamValue(team);
    const player = team.players.find((p) => p.positionName === positionName)!;
    saveTeams([team]);
    await act(async () => {
      root.render(
        <MemoryRouter
          initialEntries={[`/build-team/${team.id}/player/${player.id}`]}
        >
          <Routes>
            <Route
              path="/build-team/:teamId/player/:playerId"
              element={<PlayerPage />}
            />
          </Routes>
        </MemoryRouter>
      );
    });
    return { team, player };
  }

  it.each([
    [RosterName.HUMAN, "Human Lineman"],
    [RosterName.ORC, "Untrained Troll"],
    [RosterName.HALFLING, "Halfling Hopeful"],
  ])("draws the %s %s with its own model", async (rosterName, position) => {
    const { team, player } = await openPlayer(rosterName, position);
    const panel = container.querySelector<HTMLElement>(
      '[data-testid="player-sprite"]'
    );
    expect(panel).not.toBeNull();
    const sprite = panel!.querySelector('canvas[role="img"]');
    expect(sprite?.getAttribute("aria-label")).toBe(player.positionName);
    expect(sprite?.getAttribute("data-model")).toBe(
      modelFor(team.rosterName, player.positionName)
    );
    expect(panel!.style.borderTopColor).toBe("rgb(142, 27, 27)");
    expect(panel!.textContent).toContain(`${position} · ${team.rosterName}`);
  });

  it("sits before the characteristics and keeps the advancement section", async () => {
    await openPlayer(RosterName.HUMAN, "Human Lineman");
    const text = container.textContent ?? "";
    const sprite = container.querySelector('[data-testid="player-sprite"]')!;
    const characteristics = Array.from(container.querySelectorAll("h2")).find(
      (heading) => heading.textContent === "Characteristics"
    )!;
    expect(
      sprite.compareDocumentPosition(characteristics) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(text).toContain("Pending development");
  });
});
