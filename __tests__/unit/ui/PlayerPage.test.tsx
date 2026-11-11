import { act } from "react";
import { createRoot, Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PlayerPage } from "../../../src/ui/components/pages/PlayerPage";
import { loadTeams, saveTeams } from "../../../src/game/managers/TeamManager";
import { getRosterByRosterName } from "../../../src/data/RosterTemplates";
import {
  applyAdvancement,
  rollPendingRandomPrimary,
} from "../../../src/game/progression/progression";
import { createPlayer } from "../../../src/types/Player";
import {
  calculateTeamValue,
  createTeam,
  RosterName,
} from "../../../src/types/Team";

function dice(...values: number[]) {
  let index = 0;
  return { rollDie: () => values[index++ % values.length] };
}

/**
 * When another window spends this player's roll and their SPP, the player
 * page swaps the advancement form for the "not enough SPP" text. The reason
 * the coach's choice was refused must still be shown.
 */
describe("PlayerPage after another window spends the roll", () => {
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

  it("keeps the stale-roll notice when the form gives way to the SPP text", async () => {
    const roster = getRosterByRosterName(RosterName.HUMAN);
    const team = createTeam(
      "Notice Test",
      RosterName.HUMAN,
      { primary: 0, secondary: 0 },
      roster.rerollCost
    );
    team.players = roster.playerTemplates.map((template, index) =>
      createPlayer(template, team.id, index + 1)
    );
    team.teamValue = calculateTeamValue(team);
    const player = team.players.find((p) => (p.primary ?? []).length > 0)!;
    // Exactly enough for one Random Primary
    player.spp = 3;
    const roll = rollPendingRandomPrimary(
      player,
      player.primary![0],
      dice(1, 2, 4, 5)
    );
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
    expect(
      container.querySelectorAll('[data-testid="random-candidate"]').length
    ).toBeGreaterThan(0);

    // Another window spends the roll, and with it all the SPP
    const other = loadTeams().find((t) => t.id === team.id)!;
    if (roll.kind !== "random-primary") throw new Error("unexpected roll");
    applyAdvancement(other.players.find((p) => p.id === player.id)!, {
      kind: "random-primary",
      skill: roll.candidates[0].skill,
    });
    saveTeams([other]);

    const stale = Array.from(
      container.querySelectorAll('[data-testid="random-candidate"]')
    ).find(
      (button) => !button.textContent?.endsWith(roll.candidates[0].skill)
    )!;
    act(() => {
      stale.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(container.textContent).toContain("Not enough SPP to advance yet");
    expect(container.querySelector('[role="status"]')?.textContent).toContain(
      "another window"
    );
  });
});
