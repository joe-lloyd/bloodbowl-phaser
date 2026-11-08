/**
 * A computer team still playing in a competition cannot be deleted: its
 * games could no longer be played or simulated. The check reads the stored
 * team, so an entry made in another tab after the page rendered counts.
 */
import { act } from "react";
import { createRoot, Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.mock("../../src/firebase/config", () => ({
  isFirebaseConfigured: vi.fn(() => false),
  getDb: vi.fn(),
}));

import { createComputerTeam } from "../../src/competition/computerTeams";
import { loadTeams, saveTeam } from "../../src/game/managers/TeamManager";
import { RosterName } from "../../src/types/Team";
import { TeamManagement } from "../../src/ui/components/pages/TeamManagement";

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
  vi.restoreAllMocks();
});

it.each([
  { when: "in a competition", activeCompetitionId: "league-1", kept: true },
  { when: "free", activeCompetitionId: undefined, kept: false },
])(
  "deletes a computer team only when it is free ($when)",
  async ({ activeCompetitionId, kept }) => {
    const team = createComputerTeam(
      RosterName.ORC,
      "Nuln Hammers",
      0x335577,
      "advanced-league"
    );
    saveTeam(team);
    const alert = vi.spyOn(window, "alert").mockImplementation(() => {});
    vi.spyOn(window, "confirm").mockReturnValue(true);
    await act(async () => {
      root.render(
        <MemoryRouter>
          <TeamManagement />
        </MemoryRouter>
      );
    });

    expect(container.textContent).toContain("Computer");
    // Entered from another tab after this page rendered
    if (activeCompetitionId) saveTeam({ ...team, activeCompetitionId });
    await act(async () =>
      container
        .querySelector<HTMLButtonElement>('button[aria-label="Delete team"]')!
        .click()
    );

    expect(loadTeams().some((stored) => stored.id === team.id)).toBe(kept);
    expect(alert).toHaveBeenCalledTimes(kept ? 1 : 0);
  }
);
