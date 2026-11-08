/**
 * A computer team still playing in a competition cannot be deleted: its
 * games could no longer be played or simulated. The check reads the stored
 * team before and after the confirmation, so an entry made in another tab
 * counts.
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

/** Team Management with one computer team, and its Delete button. */
async function showTeam(): Promise<{
  team: ReturnType<typeof createComputerTeam>;
  remove: () => Promise<void>;
}> {
  const team = createComputerTeam(
    RosterName.ORC,
    "Nuln Hammers",
    0x335577,
    "advanced-league"
  );
  saveTeam(team);
  await act(async () => {
    root.render(
      <MemoryRouter>
        <TeamManagement />
      </MemoryRouter>
    );
  });
  expect(container.textContent).toContain("Computer");
  return {
    team,
    remove: () =>
      act(async () =>
        container
          .querySelector<HTMLButtonElement>('button[aria-label="Delete team"]')!
          .click()
      ),
  };
}

const stored = (teamId: string) =>
  loadTeams().some((candidate) => candidate.id === teamId);

it("deletes a computer team that is free", async () => {
  const alert = vi.spyOn(window, "alert").mockImplementation(() => {});
  vi.spyOn(window, "confirm").mockReturnValue(true);
  const { team, remove } = await showTeam();
  await remove();
  expect(stored(team.id)).toBe(false);
  expect(alert).not.toHaveBeenCalled();
});

it("keeps one entered from another tab after the page rendered", async () => {
  const alert = vi.spyOn(window, "alert").mockImplementation(() => {});
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
  const { team, remove } = await showTeam();
  saveTeam({ ...team, activeCompetitionId: "league-1" });
  await remove();
  expect(stored(team.id)).toBe(true);
  expect(alert).toHaveBeenCalledTimes(1);
  expect(confirm).not.toHaveBeenCalled();
});

it("keeps one entered while the confirmation was open", async () => {
  const alert = vi.spyOn(window, "alert").mockImplementation(() => {});
  const { team, remove } = await showTeam();
  vi.spyOn(window, "confirm").mockImplementation(() => {
    saveTeam({ ...team, activeCompetitionId: "league-1" });
    return true;
  });
  await remove();
  expect(stored(team.id)).toBe(true);
  expect(alert).toHaveBeenCalledTimes(1);
});
