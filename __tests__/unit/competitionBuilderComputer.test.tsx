/**
 * Building a league with computer teams: the organizer adds them by roster,
 * enters their own team, and the league opens with every team in it.
 */
import { act } from "react";
import { createRoot, Root } from "react-dom/client";
import { MemoryRouter, Route, Routes, useParams } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.mock("../../src/firebase/config", () => ({
  isFirebaseConfigured: vi.fn(() => false),
  getDb: vi.fn(),
}));

import { getCompetition } from "../../src/competition/repository";
import { loadTeams, saveTeam } from "../../src/game/managers/TeamManager";
import { createReadyMadeTeam } from "../../src/simulation/lineups";
import { RosterName } from "../../src/types/Team";
import { CompetitionBuilder } from "../../src/ui/components/pages/CompetitionBuilder";

function OpenedLeague() {
  return <output data-testid="opened">{useParams().id}</output>;
}

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
});

const button = (label: string) =>
  [...container.querySelectorAll("button")].find((candidate) =>
    candidate.textContent?.startsWith(label)
  )!;

it("creates a league of my team and two computer teams", async () => {
  const mine = createReadyMadeTeam(RosterName.HUMAN, "My Team", 0xaa2222);
  mine.advancementMode = "advanced-league";
  saveTeam(mine);
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={["/leagues/new"]}>
        <Routes>
          <Route
            path="/leagues/new"
            element={<CompetitionBuilder type="league" />}
          />
          <Route path="/leagues/:id" element={<OpenedLeague />} />
        </Routes>
      </MemoryRouter>
    );
  });

  const name = container.querySelector("input")!;
  await act(async () => {
    const setValue = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    )!.set!;
    setValue.call(name, "Sunday League");
    name.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => button("My Team").click());
  await act(async () => button("+ Add computer team").click());
  await act(async () => button("+ Add computer team").click());
  const rosters = [
    ...container.querySelectorAll<HTMLSelectElement>(
      "select[aria-label$=' roster']"
    ),
  ];
  expect(rosters).toHaveLength(2);
  await act(async () => {
    rosters[0].value = RosterName.ORC;
    rosters[0].dispatchEvent(new Event("change", { bubbles: true }));
  });
  await act(async () => button("Generate competition").click());

  const id = container.querySelector('[data-testid="opened"]')?.textContent;
  const league = (await getCompetition("league", id!))!;
  expect(league.name).toBe("Sunday League");
  expect(
    league.entrants.map((entrant) => [entrant.name, !!entrant.computerCoached])
  ).toEqual([
    ["My Team", false],
    [expect.any(String), true],
    [expect.any(String), true],
  ]);
  expect(league.entrants[1].rosterName).toBe(RosterName.ORC);
  // The computer's teams join the library, entered in this league
  const computerTeams = loadTeams().filter((team) => team.computerCoached);
  expect(computerTeams).toHaveLength(2);
  for (const team of computerTeams)
    expect(team.activeCompetitionId).toBe(league.id);
});
