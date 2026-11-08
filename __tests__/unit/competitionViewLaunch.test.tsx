/**
 * Playing a competition fixture from its page: the match is a league or
 * tournament game, so it awards SPP and development to both teams.
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
import { CompetitionEntrant, LeagueDoc } from "../../src/competition/types";
import { saveTeams } from "../../src/game/managers/TeamManager";
import { CompetitionView } from "../../src/ui/components/pages/CompetitionView";
import { TeamBuilder } from "../utils/test-builders";

vi.mock("../../src/firebase/config", () => ({
  isFirebaseConfigured: vi.fn(() => false),
  getDb: vi.fn(),
}));

/** Stands in for the match page: shows what it was launched with. */
function LaunchedMatch() {
  const state = useLocation().state as Record<string, unknown>;
  return (
    <output data-testid="launched">
      {JSON.stringify({
        progressionEnabled: state.progressionEnabled,
        competitionContext: state.competitionContext,
      })}
    </output>
  );
}

describe("launching a competition fixture", () => {
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

  it("plays a local league fixture with progression on", async () => {
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

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={["/leagues/season-1"]}>
          <Routes>
            <Route
              path="/leagues/:id"
              element={<CompetitionView type="league" />}
            />
            <Route path="/play" element={<LaunchedMatch />} />
          </Routes>
        </MemoryRouter>
      );
    });
    const play = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "Play local"
    )!;
    await act(async () => play.click());

    const launched = container.querySelector('[data-testid="launched"]');
    expect(JSON.parse(launched!.textContent!)).toEqual({
      progressionEnabled: true,
      competitionContext: {
        competitionType: "league",
        competitionId: "season-1",
        fixtureId: fixtures[0].id,
      },
    });
  });
});
