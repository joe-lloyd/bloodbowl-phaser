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
  vi.unstubAllGlobals();
});

async function openBuilder() {
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
  await act(async () => {
    const input = container.querySelector("input")!;
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    )!.set!.call(input, "Solo season");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function generatedLeague() {
  await act(async () => button("Generate competition").click());
  const id = container.querySelector('[data-testid="opened"]')?.textContent;
  expect(id).toBeTruthy();
  return (await getCompetition("league", id!))!;
}

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

it("fills a 16-team solo season while keeping my team and a chosen opponent", async () => {
  const mine = createReadyMadeTeam(RosterName.HUMAN, "My Team", 0xaa2222);
  mine.advancementMode = "advanced-league";
  saveTeam(mine);
  await openBuilder();
  await act(async () => button("My Team").click());
  await act(async () => button("+ Add computer team").click());
  const chosen = container.querySelector<HTMLSelectElement>(
    "select[aria-label$=' roster']"
  )!;
  await act(async () => {
    chosen.value = RosterName.ORC;
    chosen.dispatchEvent(new Event("change", { bubbles: true }));
  });
  const chosenName = chosen.getAttribute("aria-label")!.replace(/ roster$/, "");
  await act(async () => button("Fill league with computer teams").click());
  expect(button("Fill league with computer teams").disabled).toBe(true);
  await act(async () => button("Fill league with computer teams").click());

  const league = await generatedLeague();
  expect(league.entrants).toHaveLength(16);
  expect(league.entrants[0].teamId).toBe(mine.id);
  expect(league.entrants[1].name).toBe(chosenName);
  expect(league.entrants[1].rosterName).toBe(RosterName.ORC);
  expect(league.entrants.filter((team) => team.computerCoached)).toHaveLength(
    15
  );
  expect(new Set(league.entrants.map((team) => team.name)).size).toBe(16);
  expect(new Set(league.entrants.map((team) => team.rosterName)).size).toBe(16);
  const myEntrant = league.entrants[0].id;
  const myGames = league.fixtures.filter(
    (game) =>
      game.homeEntrantId === myEntrant || game.awayEntrantId === myEntrant
  );
  expect(myGames).toHaveLength(15);
  expect(
    new Set(
      myGames.map((game) =>
        game.homeEntrantId === myEntrant
          ? game.awayEntrantId
          : game.homeEntrantId
      )
    ).size
  ).toBe(15);
  expect(league.fixtures).toHaveLength(120);
  expect(Math.max(...league.fixtures.map((game) => game.round))).toBe(15);
});

it.each([8, 32])("fills an entire %i-team computer league", async (size) => {
  await openBuilder();
  const sizePicker = container.querySelector<HTMLSelectElement>(
    'select[aria-label="League size"]'
  )!;
  expect(sizePicker).not.toBeNull();
  await act(async () => {
    sizePicker.value = String(size);
    sizePicker.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await act(async () => button("Fill league with computer teams").click());
  const league = await generatedLeague();
  expect(league.entrants).toHaveLength(size);
  expect(league.entrants.every((team) => team.computerCoached)).toBe(true);
  expect(new Set(league.entrants.map((team) => team.name)).size).toBe(size);
  expect(new Set(league.entrants.map((team) => team.rosterName)).size).toBe(
    Math.min(size, Object.values(RosterName).length)
  );
  expect(league.fixtures).toHaveLength((size * (size - 1)) / 2);
  for (const team of league.entrants) {
    expect(
      league.fixtures.filter(
        (game) =>
          game.homeEntrantId === team.id || game.awayEntrantId === team.id
      )
    ).toHaveLength(size - 1);
  }
});

it("fills a league without secure-context browser APIs", async () => {
  vi.stubGlobal("crypto", {});
  await openBuilder();
  await act(async () => button("Fill league with computer teams").click());
  const league = await generatedLeague();
  expect(league.entrants).toHaveLength(16);
  expect(new Set(league.entrants.map((team) => team.name)).size).toBe(16);
  expect(league.fixtures).toHaveLength(120);
});
