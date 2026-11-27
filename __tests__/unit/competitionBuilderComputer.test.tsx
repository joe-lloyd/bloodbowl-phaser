import { fixtureValue } from "../../src/testing/fixtureValue";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes, useParams } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.mock("../../src/firebase/config", () => ({
  isFirebaseConfigured: vi.fn(() => false),
  getDb: vi.fn(),
}));

import { getCompetition } from "../../src/competition/repository";
import { fixtureContext } from "../../src/competition/fixtureContext";
import { recordCompetitionFixture } from "../../src/competition/resultRecording";
import { loadTeams, saveTeam } from "../../src/game/managers/TeamManager";
import { createReadyMadeTeam } from "../../src/simulation/lineups";
import { RosterName } from "../../src/types/Team";
import { CompetitionBuilder } from "../../src/ui/components/pages/CompetitionBuilder";

function OpenedLeague() {
  return <output data-testid="opened">{useParams()["id"]}</output>;
}

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
  vi.unstubAllGlobals();
});

const valueSetter = fixtureValue(
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")
);

function typeInto(input: HTMLInputElement, value: string) {
  act(() => {
    Reflect.apply(fixtureValue(valueSetter.set), input, [value]);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function openBuilder(type: "league" | "tournament" = "league") {
  const path = type === "league" ? "/leagues" : "/tournaments";
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[`${path}/new`]}>
        <Routes>
          <Route
            path={`${path}/new`}
            element={<CompetitionBuilder type={type} />}
          />
          <Route path={`${path}/:id`} element={<OpenedLeague />} />
        </Routes>
      </MemoryRouter>
    );
  });
  typeInto(fixtureValue(container.querySelector("input")), "Solo season");
}

async function generatedLeague() {
  await act(async () => {
    button("Generate competition").click();
  });
  const id = container.querySelector('[data-testid="opened"]')?.textContent;
  expect(id).toBeTruthy();
  return fixtureValue((await getCompetition("league", fixtureValue(id))));
}

const button = (label: string) =>
  fixtureValue([...container.querySelectorAll("button")].find((candidate) =>
    candidate.textContent?.startsWith(label)
  ));

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

  typeInto(fixtureValue(container.querySelector("input")), "Sunday League");
  await act(async () => {
    button("My Team").click();
  });
  await act(async () => {
    button("+ Add computer team").click();
  });
  await act(async () => {
    button("+ Add computer team").click();
  });
  const rosters = [
    ...container.querySelectorAll<HTMLSelectElement>(
      "select[aria-label$=' roster']"
    ),
  ];
  expect(rosters).toHaveLength(2);
  await act(async () => {
    fixtureValue(rosters[0]).value = RosterName.ORC;
    fixtureValue(rosters[0]).dispatchEvent(new Event("change", { bubbles: true }));
  });
  await act(async () => {
    button("Generate competition").click();
  });

  const id = container.querySelector('[data-testid="opened"]')?.textContent;
  const league = fixtureValue((await getCompetition("league", fixtureValue(id))));
  expect(league.name).toBe("Sunday League");
  expect(
    league.entrants.map((entrant) => [entrant.name, !!entrant.computerCoached])
  ).toEqual([
    ["My Team", false],
    [expect.any(String), true],
    [expect.any(String), true],
  ]);
  expect(fixtureValue(league.entrants[1]).rosterName).toBe(RosterName.ORC);

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
  await act(async () => {
    button("My Team").click();
  });
  await act(async () => {
    button("+ Add computer team").click();
  });
  const chosen = fixtureValue(container.querySelector<HTMLSelectElement>(
    "select[aria-label$=' roster']"
  ));
  await act(async () => {
    chosen.value = RosterName.ORC;
    chosen.dispatchEvent(new Event("change", { bubbles: true }));
  });
  const chosenName = fixtureValue(chosen.getAttribute("aria-label")).replace(/ roster$/, "");
  await act(async () => {
    button("Fill league with computer teams").click();
  });
  expect(button("Fill league with computer teams").disabled).toBe(true);
  await act(async () => {
    button("Fill league with computer teams").click();
  });

  const league = await generatedLeague();
  expect(league.entrants).toHaveLength(16);
  expect(fixtureValue(league.entrants[0]).teamId).toBe(mine.id);
  expect(fixtureValue(league.entrants[1]).name).toBe(chosenName);
  expect(fixtureValue(league.entrants[1]).rosterName).toBe(RosterName.ORC);
  expect(league.entrants.filter((team) => team.computerCoached)).toHaveLength(
    15
  );
  expect(new Set(league.entrants.map((team) => team.name)).size).toBe(16);
  expect(new Set(league.entrants.map((team) => team.rosterName)).size).toBe(16);
  const myEntrant = fixtureValue(league.entrants[0]).id;
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
  const sizePicker = fixtureValue(container.querySelector<HTMLSelectElement>(
    'select[aria-label="League size"]'
  ));
  expect(sizePicker).not.toBeNull();
  await act(async () => {
    sizePicker.value = String(size);
    sizePicker.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await act(async () => {
    button("Fill league with computer teams").click();
  });
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
  await act(async () => {
    button("Fill league with computer teams").click();
  });
  const league = await generatedLeague();
  expect(league.entrants).toHaveLength(16);
  expect(new Set(league.entrants.map((team) => team.name)).size).toBe(16);
  expect(league.fixtures).toHaveLength(120);
});

it("lets an organizer replace a NAF-only build after switching to GW rules", async () => {
  await openBuilder();
  const choose = async (selector: string, value: string) => {
    await act(async () => {
      const select = fixtureValue(container.querySelector<HTMLSelectElement>(selector));
      select.value = value;
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
  };
  await choose('select[aria-label="Sevens rules"]', "naf-sevens-2026-09-26");
  await act(async () => {
    button("+ Add computer team").click();
  });
  await choose('select[aria-label$=" roster"]', RosterName.SNOTLING);
  await choose('select[aria-label$=" build"]', "snotling-max-snots");
  await choose('select[aria-label="Sevens rules"]', "gw-2025");
  expect(container.textContent).toContain("Choose another build.");
  expect(
    fixtureValue(container.querySelector<HTMLSelectElement>('select[aria-label$=" build"]'))
      .value
  ).toBe("snotling-max-snots");
  await choose('select[aria-label$=" build"]', "snotling-max-strength");
  expect(container.textContent).not.toContain("Choose another build.");
  await act(async () => {
    button("+ Add computer team").click();
  });
  await generatedLeague();
  expect(
    loadTeams().filter(
      (team) => team.computerTemplateId === "snotling-max-strength"
    )
  ).toHaveLength(1);
});

const click = (target: HTMLElement) => {
  act(() => {
    target.click();
  });
};

async function openFourTeamTournament() {
  await openBuilder("tournament");
  for (let added = 0; added < 4; added++) click(button("+ Add computer team"));
}

const gameTypeToggle = (label: string) =>
  fixtureValue(
    [
      ...container.querySelectorAll<HTMLButtonElement>(
        ':scope [aria-label="Game types in the tournament"] button'
      ),
    ].find((candidate) => candidate.textContent.includes(label))
  );

const roundChoice = (round: number, label: string) =>
  fixtureValue(
    container.querySelector<HTMLButtonElement>(
      `:scope [aria-label="Round ${String(round)} game type"] [aria-label="${label}"]`
    )
  );

async function generatedTournament() {
  await act(async () => {
    button("Generate competition").click();
    await Promise.resolve();
  });
  const id = fixtureValue(container.querySelector('[data-testid="opened"]')).textContent;
  return fixtureValue(await getCompetition("tournament", id));
}

it("draws a random mixed tournament's first round and leaves the final for later", async () => {
  await openFourTeamTournament();
  click(gameTypeToggle("Street Bowl"));
  click(gameTypeToggle("Beach Bowl"));

  const tournament = await generatedTournament();
  expect(tournament.gameTypePool).toEqual(["sevens", "street-bowl", "beach-bowl"]);
  const firstRound = new Set(
    tournament.fixtures.filter((game) => game.round === 1).map((game) => game.gameType)
  );
  expect(firstRound.size).toBe(1);
  expect(["sevens", "street-bowl", "beach-bowl"]).toContain([...firstRound][0]);
  const finalOf = (competition: typeof tournament) =>
    competition.fixtures.filter((game) => game.round === 2).map((game) => game.gameType);
  expect(finalOf(tournament)).toEqual([undefined]);

  let current = tournament;
  for (const game of tournament.fixtures) {
    if (game.round !== 1) continue;
    await recordCompetitionFixture({
      context: fixtureContext({ competition: current, fixtureId: game.id, playedVia: "reported" }),
      homeScore: 1,
      awayScore: 0,
    });
    current = fixtureValue(await getCompetition("tournament", tournament.id));
  }
  const [final] = finalOf(current);
  expect(["sevens", "street-bowl", "beach-bowl"]).toContain(final);
});

it("plays a set-order tournament in the order the organizer picked", async () => {
  await openFourTeamTournament();
  click(gameTypeToggle("Beach Bowl"));
  click(button("Set order"));
  click(fixtureValue(container.querySelector<HTMLInputElement>('input[type="checkbox"]')));
  typeInto(fixtureValue(container.querySelector<HTMLInputElement>('input[type="number"]')), "800000");
  click(roundChoice(1, "Beach Bowl"));
  click(roundChoice(2, "Sevens"));

  const tournament = await generatedTournament();
  expect(tournament.entrants).toHaveLength(4);
  expect(tournament.gameTypePool).toBeUndefined();
  expect(tournament.rosterProfile?.draftBudget).toBe(800_000);
  expect(tournament.fixtures.map((game) => [game.round, game.gameType])).toEqual([
    [1, "beach-bowl"],
    [1, "beach-bowl"],
    [2, "sevens"],
  ]);
});
