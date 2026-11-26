import { fixtureValue } from "../../src/testing/fixtureValue";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.mock("../../src/firebase/config", () => ({
  isFirebaseConfigured: vi.fn(() => false),
  getDb: vi.fn(),
}));

import { createComputerTeam } from "../fixtures/computerTeam";
import { loadTeams, saveTeam } from "../../src/game/managers/TeamManager";
import { RosterName } from "../../src/types/Team";
import { TeamManagement } from "../../src/ui/components/pages/TeamManagement";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  localStorage.clear();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => {
    root.unmount();
  });
  container.remove();
  vi.restoreAllMocks();
});

async function showTeam(): Promise<{
  team: ReturnType<typeof createComputerTeam>;
  remove: () => Promise<void>;
}> {
  const team = createComputerTeam({ rosterName: RosterName.ORC, name: "Nuln Hammers", primaryColour: 0x335577, advancementMode: "advanced-league" });
  saveTeam(team);
  await act(async () => {
    root.render(
      <MemoryRouter>
        <TeamManagement />
      </MemoryRouter>
    );
  });
  await act(async () => {
    fixtureValue(container.querySelector<HTMLButtonElement>("#computer-tab")).click();
  });
  expect(container.textContent).toContain("Computer");
  return {
    team,
    remove: () =>
      act(async () => {
        fixtureValue(container
          .querySelector<HTMLButtonElement>('button[aria-label="Delete team"]'))
          .click();
      }),
  };
}

const stored = (teamId: string) =>
  loadTeams().some((candidate) => candidate.id === teamId);

it("deletes a computer team that is free", async () => {
  const alert = vi.spyOn(globalThis, "alert").mockImplementation(() => {});
  vi.spyOn(globalThis, "confirm").mockReturnValue(true);
  const { team, remove } = await showTeam();
  await remove();
  expect(stored(team.id)).toBe(false);
  expect(alert).not.toHaveBeenCalled();
});

it("keeps one entered from another tab after the page rendered", async () => {
  const alert = vi.spyOn(globalThis, "alert").mockImplementation(() => {});
  const confirm = vi.spyOn(globalThis, "confirm").mockReturnValue(true);
  const { team, remove } = await showTeam();
  saveTeam({ ...team, activeCompetitionId: "league-1" });
  await remove();
  expect(stored(team.id)).toBe(true);
  expect(alert).toHaveBeenCalledTimes(1);
  expect(confirm).not.toHaveBeenCalled();
});

it("keeps one entered while the confirmation was open", async () => {
  const alert = vi.spyOn(globalThis, "alert").mockImplementation(() => {});
  const { team, remove } = await showTeam();
  vi.spyOn(globalThis, "confirm").mockImplementation(() => {
    saveTeam({ ...team, activeCompetitionId: "league-1" });
    return true;
  });
  await remove();
  expect(stored(team.id)).toBe(true);
  expect(alert).toHaveBeenCalledTimes(1);
});
