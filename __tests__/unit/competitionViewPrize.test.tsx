/**
 * The tournament page shows the champion's prize, and once the tournament
 * completes, that the prize went into the champion's Treasury
 * (openspec/specs/tournament-prizes).
 */
import { act } from "react";
import { createRoot, Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  computeStandings,
  generateSingleElimination,
} from "../../src/competition/logic";
import { saveCompetition } from "../../src/competition/repository";
import { CompetitionEntrant, TournamentDoc } from "../../src/competition/types";
import {
  getTeamById,
  saveTeams,
  setTeamRepository,
  TeamRepository,
} from "../../src/game/managers/TeamManager";
import { recordCompetitionFixture } from "../../src/competition/resultRecording";
import { Team } from "../../src/types/Team";
import { CompetitionView } from "../../src/ui/components/pages/CompetitionView";
import { TeamBuilder } from "../utils/test-builders";

vi.mock("../../src/firebase/config", () => ({
  isFirebaseConfigured: vi.fn(() => false),
  getDb: vi.fn(),
}));

function typeInto(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value"
  )!.set!;
  setter.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("the tournament page's prize", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    localStorage.clear();
    setTeamRepository(null);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  const renderPage = async () => {
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={["/tournaments/cup"]}>
          <Routes>
            <Route
              path="/tournaments/:id"
              element={<CompetitionView type="tournament" />}
            />
          </Routes>
        </MemoryRouter>
      );
    });
  };

  it("shows the prize, then the payment once the final is recorded", async () => {
    const teams = ["Reavers", "Badgers"].map((name) => {
      const team = new TeamBuilder()
        .withId(name)
        .withName(name)
        .withPlayers(7)
        .withTreasury(10_000)
        .build();
      team.advancementMode = "advanced-league";
      return team;
    });
    saveTeams(teams);
    const entrants: CompetitionEntrant[] = teams.map((team, index) => ({
      id: `local:${team.id}`,
      teamId: team.id,
      ownerUid: null,
      name: team.name,
      rosterName: team.rosterName,
      seed: index + 1,
    }));
    const fixtures = generateSingleElimination(entrants);
    const cup: TournamentDoc = {
      id: "cup",
      type: "tournament",
      format: "single-elimination",
      name: "Cup",
      organizerUid: null,
      participantUids: [],
      status: "active",
      entrants,
      fixtures,
      standings: computeStandings(entrants, fixtures),
      createdAt: 1,
      updatedAt: 1,
      prize: 100_000,
    };
    await saveCompetition(cup);
    await renderPage();

    const prize = () =>
      container.querySelector('[data-testid="tournament-prize"]')?.textContent;
    const outcome = () =>
      container.querySelector('[data-testid="tournament-prize-outcome"]')
        ?.textContent;
    expect(prize()).toContain("Champion's prize: 100,000 gp");
    expect(outcome()).toBeUndefined();

    const field = (label: string) =>
      container.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`);
    await act(async () => typeInto(field("Reavers score")!, "2"));
    await act(async () => typeInto(field("Badgers score")!, "0"));
    const record = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "Record result"
    )!;
    await act(async () => record.click());

    expect(container.textContent).toContain("Champion: Reavers");
    expect(outcome()).toBe("+100,000 gp prize paid into the Treasury");
    expect(getTeamById("Reavers")?.treasury).toBe(110_000);
    expect(getTeamById("Badgers")?.treasury).toBe(10_000);

    // Opening the page again pays nothing more
    await act(async () => root.unmount());
    root = createRoot(container);
    await renderPage();
    expect(outcome()).toBe("+100,000 gp prize paid into the Treasury");
    expect(getTeamById("Reavers")?.treasury).toBe(110_000);
  });

  it("pays once when the coach's library arrives after the page loads", async () => {
    const champion = new TeamBuilder()
      .withId("Reavers")
      .withName("Reavers")
      .withPlayers(7)
      .withTreasury(10_000)
      .build();
    champion.advancementMode = "advanced-league";
    const entrants: CompetitionEntrant[] = ["Reavers", "Badgers"].map(
      (name, index) => ({
        id: `local:${name}`,
        teamId: name,
        ownerUid: null,
        name,
        rosterName: "Human",
        seed: index + 1,
      })
    );
    const fixtures = generateSingleElimination(entrants);
    await saveCompetition({
      id: "cup",
      type: "tournament",
      format: "single-elimination",
      name: "Cup",
      organizerUid: null,
      participantUids: [],
      status: "active",
      entrants,
      fixtures,
      standings: computeStandings(entrants, fixtures),
      createdAt: 1,
      updatedAt: 1,
      prize: 100_000,
    });
    // The final is recorded while this coach's library holds no team
    await recordCompetitionFixture(
      {
        competitionType: "tournament",
        competitionId: "cup",
        fixtureId: fixtures[0].id,
      },
      2,
      0
    );

    // A direct load of the page, before the signed-in library is active
    await renderPage();
    expect(container.textContent).toContain("Champion: Reavers");
    expect(getTeamById("Reavers")).toBeUndefined();

    // The cloud library arrives
    let stored: Team[] = [structuredClone(champion)];
    const cloud: TeamRepository = {
      loadTeams: () => structuredClone(stored),
      saveTeams: (teams) => {
        stored = structuredClone(teams);
      },
      deleteTeam: () => undefined,
    };
    await act(async () => setTeamRepository(cloud));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(getTeamById("Reavers")?.treasury).toBe(110_000);
    expect(
      container.querySelector('[data-testid="tournament-prize-outcome"]')
        ?.textContent
    ).toBe("+100,000 gp prize paid into the Treasury");

    // The library swapped in again pays nothing more
    await act(async () => setTeamRepository(cloud));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(getTeamById("Reavers")?.treasury).toBe(110_000);
    setTeamRepository(null);
  });
});
