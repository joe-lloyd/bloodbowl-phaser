/**
 * A league's page shows the round to play next first and in full, the rest
 * of the season after it, and the rounds already played folded away.
 */
import { act } from "react";
import { createRoot, Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/firebase/config", () => ({
  isFirebaseConfigured: vi.fn(() => false),
  getDb: vi.fn(),
}));

import {
  computeStandings,
  generateRoundRobin,
} from "../../src/competition/logic";
import {
  getCompetition,
  saveCompetition,
} from "../../src/competition/repository";
import {
  CompetitionEntrant,
  CompetitionFixture,
  LeagueDoc,
} from "../../src/competition/types";
import { saveTeam } from "../../src/game/managers/TeamManager";
import { createReadyMadeTeam } from "../../src/simulation/lineups";
import { RosterName } from "../../src/types/Team";
import { CompetitionView } from "../../src/ui/components/pages/CompetitionView";

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

const NAMES = ["Reavers", "Badgers", "Nuln Hammers", "Grim Lads"];

/** Four teams, three rounds of two games. Reavers are in this library. */
async function league(
  play: (fixtures: CompetitionFixture[]) => void = () => {}
): Promise<LeagueDoc> {
  const reavers = createReadyMadeTeam(RosterName.HUMAN, "Reavers", 0xaa2222);
  reavers.colors = { primary: 0xaa2222, secondary: 0xffffff };
  saveTeam(reavers);
  const entrants: CompetitionEntrant[] = NAMES.map((name, index) => ({
    id: `local:${name}`,
    teamId: index === 0 ? reavers.id : name,
    ownerUid: null,
    name,
    rosterName: "Human",
    seed: index + 1,
  }));
  const fixtures = generateRoundRobin(entrants);
  play(fixtures);
  const doc: LeagueDoc = {
    id: "season",
    type: "league",
    name: "Season",
    organizerUid: null,
    participantUids: [],
    status: fixtures.every((game) => game.status === "complete")
      ? "complete"
      : "active",
    entrants,
    fixtures,
    standings: computeStandings(entrants, fixtures),
    points: { win: 3, draw: 1, loss: 0 },
    createdAt: 1,
    updatedAt: 1,
  };
  await saveCompetition(doc);
  return doc;
}

/** Record `game` as played, 2-1 to the home side. */
function played(game: CompetitionFixture) {
  game.status = "complete";
  game.result = { homeScore: 2, awayScore: 1 };
}

async function show() {
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={["/leagues/season"]}>
        <Routes>
          <Route
            path="/leagues/:id"
            element={<CompetitionView type="league" />}
          />
        </Routes>
      </MemoryRouter>
    );
  });
}

async function reload() {
  await act(async () => root.unmount());
  root = createRoot(container);
  await show();
}

const sectionTitles = () =>
  [...container.querySelectorAll("section h2")].map((h2) => h2.textContent);
const section = (title: string) =>
  [...container.querySelectorAll("section")].find(
    (candidate) => candidate.querySelector("h2")?.textContent === title
  );
const nextRound = () =>
  container.querySelector('[data-testid="next-round"] h3')?.textContent;
const featured = () => [
  ...container.querySelectorAll<HTMLElement>(
    '[data-testid="next-round-fixture"]'
  ),
];
const upcomingRounds = () =>
  [...(section("Upcoming rounds")?.querySelectorAll("h3") ?? [])].map(
    (h3) => h3.textContent
  );
const completedToggles = () => [
  ...container.querySelectorAll<HTMLButtonElement>(
    '[data-testid="completed-round"] button'
  ),
];
const panelOf = (toggle: HTMLButtonElement) =>
  document.getElementById(toggle.getAttribute("aria-controls")!)!;

function typeInto(input: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value"
  )!.set!.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("a league's rounds", () => {
  it("shows round one first under the standings when nothing is played", async () => {
    const doc = await league();
    await show();

    expect(sectionTitles()).toEqual([
      "Your teams",
      "Entrants",
      "Standings",
      "Next round",
      "Upcoming rounds",
    ]);
    expect(nextRound()).toBe("Round 1");
    // Every game in the round, in schedule order, each with its actions
    expect(featured().map((game) => game.getAttribute("aria-label"))).toEqual(
      doc.fixtures
        .filter((game) => game.round === 1)
        .map(
          (game) =>
            `${game.homeEntrantId!.slice(6)} v ${game.awayEntrantId!.slice(6)}`
        )
    );
    for (const game of featured()) {
      expect(game.textContent).toContain("Play local");
      expect(game.textContent).toContain("Record result");
    }
    expect(upcomingRounds()).toEqual(["Round 2", "Round 3"]);
    expect(completedToggles()).toHaveLength(0);
  });

  it("keeps a partly played round first, with its result and the game left", async () => {
    const doc = await league((fixtures) => played(fixtures[0]!));
    await show();

    expect(nextRound()).toBe("Round 1");
    expect(section("Next round")?.textContent).toContain("1 of 2 games played");
    const [done, left] = featured();
    expect(done!.dataset.status).toBe("complete");
    expect(done!.textContent).toContain("2–1");
    expect(done!.textContent).not.toContain("Record result");
    expect(left!.dataset.status).toBe("ready");
    expect(left!.textContent).toContain("Record result");
    expect(done!.getAttribute("aria-label")).toBe(
      `${doc.fixtures[0]!.homeEntrantId!.slice(6)} v ${doc.fixtures[0]!.awayEntrantId!.slice(6)}`
    );
    expect(upcomingRounds()).toEqual(["Round 2", "Round 3"]);
    expect(completedToggles()).toHaveLength(0);
  });

  it("promotes the next round when the last game of the round is recorded", async () => {
    const doc = await league((fixtures) => played(fixtures[0]!));
    await show();
    const left = doc.fixtures[1]!;
    const home = left.homeEntrantId!.slice(6);
    const away = left.awayEntrantId!.slice(6);
    const field = (label: string) =>
      container.querySelector<HTMLInputElement>(
        `input[aria-label="${label}"]`
      )!;
    await act(async () => typeInto(field(`${home} score`), "0"));
    await act(async () => typeInto(field(`${away} score`), "3"));
    const record = [...featured()[1]!.querySelectorAll("button")].find(
      (button) => button.textContent === "Record result"
    )!;
    await act(async () => record.click());

    expect(nextRound()).toBe("Round 2");
    expect(upcomingRounds()).toEqual(["Round 3"]);
    expect(sectionTitles()).toEqual([
      "Your teams",
      "Entrants",
      "Standings",
      "Next round",
      "Upcoming rounds",
      "Completed rounds",
    ]);
    const [roundOne] = completedToggles();
    expect(completedToggles()).toHaveLength(1);
    expect(roundOne!.textContent).toContain("Round 1");
    expect(roundOne!.getAttribute("aria-expanded")).toBe("false");
    expect(panelOf(roundOne!).hidden).toBe(true);

    await act(async () => roundOne!.click());
    expect(roundOne!.getAttribute("aria-expanded")).toBe("true");
    expect(panelOf(roundOne!).hidden).toBe(false);
    expect(panelOf(roundOne!).textContent).toContain(home);
    expect(panelOf(roundOne!).textContent).toContain(away);
    const scores = [...panelOf(roundOne!).querySelectorAll("strong")].map(
      (score) => score.textContent
    );
    expect(scores).toEqual(["2", "1", "0", "3"]);

    await act(async () => roundOne!.click());
    expect(roundOne!.getAttribute("aria-expanded")).toBe("false");
    expect(panelOf(roundOne!).hidden).toBe(true);

    // The stored league gives the same page after a reload, folded again
    expect(
      (await getCompetition("league", "season"))?.fixtures[1]?.status
    ).toBe("complete");
    await reload();
    expect(nextRound()).toBe("Round 2");
    expect(completedToggles().map((toggle) => toggle.textContent)).toEqual([
      expect.stringContaining("Round 1"),
    ]);
    expect(completedToggles()[0]!.getAttribute("aria-expanded")).toBe("false");
  });

  it("shows a finished league's history without a next round", async () => {
    await league((fixtures) => fixtures.forEach(played));
    await show();

    expect(container.querySelector('[data-testid="next-round"]')).toBeNull();
    expect(section("Next round")).toBeUndefined();
    expect(section("Upcoming rounds")).toBeUndefined();
    expect(section("Standings")).toBeDefined();
    const toggles = completedToggles();
    expect(toggles.map((toggle) => toggle.textContent)).toEqual([
      expect.stringContaining("Round 1"),
      expect.stringContaining("Round 2"),
      expect.stringContaining("Round 3"),
    ]);
    for (const toggle of toggles) {
      expect(toggle.getAttribute("aria-expanded")).toBe("false");
      expect(panelOf(toggle).hidden).toBe(true);
    }
  });

  it("puts a crest by every team: its kit when known, a neutral one if not", async () => {
    await league();
    await show();

    const crests = featured().flatMap((game) => [
      ...game.querySelectorAll<HTMLElement>("[data-crest]"),
    ]);
    expect(crests).toHaveLength(4);
    const byInitials = new Map(
      crests.map((crest) => [crest.textContent, crest.dataset.crest])
    );
    expect(byInitials).toEqual(
      new Map([
        ["RE", "kit"],
        ["BA", "fallback"],
        ["NH", "fallback"],
        ["GL", "fallback"],
      ])
    );
    const kit = crests.find((crest) => crest.dataset.crest === "kit")!;
    // jsdom normalises the colours to rgb()
    expect(kit.style.backgroundColor).toBe("rgb(255, 255, 255)");
    expect((kit.firstElementChild as HTMLElement).style.backgroundColor).toBe(
      "rgb(170, 34, 34)"
    );
    // The name is still there in words beside the crest
    for (const name of NAMES) {
      expect(section("Next round")?.textContent).toContain(name);
    }
  });
});
