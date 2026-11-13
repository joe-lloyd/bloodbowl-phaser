/**
 * A load the team library starts must not put an older competition back on
 * the page after the coach recorded a result (tournament-prizes spec).
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
} from "../../src/game/managers/TeamManager";
import { CompetitionView } from "../../src/ui/components/pages/CompetitionView";
import { TeamBuilder } from "../utils/test-builders";

vi.mock("../../src/firebase/config", () => ({
  isFirebaseConfigured: vi.fn(() => false),
  getDb: vi.fn(),
}));

/** Holds the page's next load open after it has read the competition. */
const hold = vi.hoisted(() => ({ gate: null as Promise<void> | null }));
vi.mock("../../src/competition/resultRecording", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("../../src/competition/resultRecording")
    >();
  return {
    ...actual,
    closeWalkovers: async (
      ...args: Parameters<typeof actual.closeWalkovers>
    ) => {
      const loaded = await actual.closeWalkovers(...args);
      const gate = hold.gate;
      if (gate) await gate;
      return loaded;
    },
  };
});

function typeInto(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value"
  )!.set!;
  setter.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("a library refresh while a result is recorded", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    localStorage.clear();
    setTeamRepository(null);
    hold.gate = null;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    hold.gate = null;
    await act(async () => root.unmount());
    container.remove();
  });

  it("keeps the recorded final when the older load finishes last", async () => {
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
    const field = (label: string) =>
      container.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`);
    expect(field("Reavers score")).not.toBeNull();

    // The library is swapped: a load starts, reads the open final, and waits
    let release!: () => void;
    hold.gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await act(async () => setTeamRepository(null));

    // The coach records the final before that load finishes
    await act(async () => typeInto(field("Reavers score")!, "2"));
    await act(async () => typeInto(field("Badgers score")!, "0"));
    const record = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "Record result"
    )!;
    await act(async () => record.click());
    expect(container.textContent).toContain("Champion: Reavers");

    // The older load finishes last
    hold.gate = null;
    await act(async () => {
      release();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(container.textContent).toContain("Champion: Reavers");
    expect(field("Reavers score")).toBeNull();
    expect(
      container.querySelector('[data-testid="tournament-prize-outcome"]')
        ?.textContent
    ).toBe("+100,000 gp prize paid into the Treasury");
    expect(getTeamById("Reavers")?.treasury).toBe(110_000);
    expect(getTeamById("Badgers")?.treasury).toBe(10_000);
  });
});
