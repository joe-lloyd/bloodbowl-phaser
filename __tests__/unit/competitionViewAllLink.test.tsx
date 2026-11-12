/**
 * The "All leagues" / "All tournaments" control at the top of a competition
 * page is a link to the list, not a step back through history. After a
 * league match the results screen pushes the league page, so a history step
 * from there lands on the match (/play) and reloads it.
 */
import { act } from "react";
import { createRoot, Root } from "react-dom/client";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  computeStandings,
  generateRoundRobin,
} from "../../src/competition/logic";
import { saveCompetition } from "../../src/competition/repository";
import {
  CompetitionEntrant,
  CompetitionType,
  LeagueDoc,
} from "../../src/competition/types";
import { saveTeams } from "../../src/game/managers/TeamManager";
import { CompetitionView } from "../../src/ui/components/pages/CompetitionView";
import { TeamBuilder } from "../utils/test-builders";

vi.mock("../../src/firebase/config", () => ({
  isFirebaseConfigured: vi.fn(() => false),
  getDb: vi.fn(),
}));

/** Every route renders where the router is, so a test can read it. */
function Where() {
  return <output data-testid="where">{useLocation().pathname}</output>;
}

async function saveLeague(): Promise<void> {
  const teams = ["home", "away"].map((id) =>
    new TeamBuilder().withId(id).withName(id).withPlayers(7).build()
  );
  saveTeams(teams);
  const entrants: CompetitionEntrant[] = teams.map((team, index) => ({
    id: `local:${team.id}`,
    teamId: team.id,
    ownerUid: null,
    name: team.name,
    rosterName: team.rosterName,
    seed: index + 1,
  }));
  const fixtures = generateRoundRobin(entrants);
  const league: LeagueDoc = {
    id: "season-1",
    type: "league",
    name: "Season 1",
    organizerUid: null,
    participantUids: [],
    status: "active",
    entrants,
    fixtures,
    standings: computeStandings(entrants, fixtures),
    points: { win: 3, draw: 1, loss: 0 },
    createdAt: 1,
    updatedAt: 1,
  };
  await saveCompetition(league);
}

describe("the All leagues control on a competition page", () => {
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

  async function renderAt(
    entries: string[],
    type: CompetitionType = "league"
  ): Promise<void> {
    const list = type === "league" ? "/leagues" : "/tournaments";
    await act(async () => {
      root.render(
        <MemoryRouter
          initialEntries={entries}
          initialIndex={entries.length - 1}
        >
          <Where />
          <Routes>
            <Route path={list} element={<p>{list} list</p>} />
            <Route
              path={`${list}/:id`}
              element={<CompetitionView type={type} />}
            />
            <Route path="/play" element={<p>the match</p>} />
          </Routes>
        </MemoryRouter>
      );
    });
  }

  const control = (label: string): HTMLElement => {
    const found = [
      ...container.querySelectorAll<HTMLElement>("a, button"),
    ].find((element) => element.textContent?.trim().endsWith(label));
    if (!found) throw new Error(`No control labelled ${label}`);
    return found;
  };

  const where = () =>
    container.querySelector('[data-testid="where"]')!.textContent;

  it("opens the league list after a league match, not the match", async () => {
    await saveLeague();
    // League page -> match -> results screen pushes the league page again.
    await renderAt(["/leagues/season-1", "/play", "/leagues/season-1"]);
    expect(container.textContent).toContain("Season 1");

    await act(async () => control("All leagues").click());

    expect(where()).toBe("/leagues");
    expect(container.textContent).toContain("/leagues list");
    expect(container.textContent).not.toContain("the match");
  });

  it("is a real link to the league list when the page is opened directly", async () => {
    await saveLeague();
    await renderAt(["/leagues/season-1"]);

    const link = control("All leagues");
    expect(link.tagName).toBe("A");
    expect(link.getAttribute("href")).toBe("/leagues");

    await act(async () => link.click());
    expect(where()).toBe("/leagues");
  });

  it("goes to the league list from a page that cannot load", async () => {
    await renderAt(["/play", "/leagues/missing"]);

    const link = control("All leagues");
    expect(link.tagName).toBe("A");
    expect(link.getAttribute("href")).toBe("/leagues");

    await act(async () => link.click());
    expect(where()).toBe("/leagues");
  });

  it("links a tournament page to the tournament list", async () => {
    await renderAt(["/play", "/tournaments/missing"], "tournament");

    const link = control("All tournaments");
    expect(link.getAttribute("href")).toBe("/tournaments");

    await act(async () => link.click());
    expect(where()).toBe("/tournaments");
  });
});
