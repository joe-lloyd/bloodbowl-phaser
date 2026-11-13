/**
 * A change that finishes after the page moved to another competition must
 * not show the old competition under the new route, nor send later actions
 * to it (tournament-prizes spec: the prize is still paid once).
 */
import { act } from "react";
import { createRoot, Root } from "react-dom/client";
import {
  MemoryRouter,
  NavigateFunction,
  Route,
  Routes,
  useNavigate,
} from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  computeStandings,
  generateSingleElimination,
} from "../../src/competition/logic";
import {
  getCompetition,
  saveCompetition,
} from "../../src/competition/repository";
import { CompetitionEntrant, TournamentDoc } from "../../src/competition/types";
import {
  getTeamById,
  saveTeams,
  setTeamRepository,
} from "../../src/game/managers/TeamManager";
import { Team } from "../../src/types/Team";
import { CompetitionView } from "../../src/ui/components/pages/CompetitionView";
import { TeamBuilder } from "../utils/test-builders";

vi.mock("../../src/firebase/config", () => ({
  isFirebaseConfigured: vi.fn(() => false),
  getDb: vi.fn(),
}));

/** Holds a recorded result open after it is written, before the page sees it. */
const hold = vi.hoisted(() => ({ gate: null as Promise<void> | null }));
vi.mock("../../src/competition/resultRecording", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("../../src/competition/resultRecording")
    >();
  return {
    ...actual,
    recordCompetitionFixture: async (
      ...args: Parameters<typeof actual.recordCompetitionFixture>
    ) => {
      const gate = hold.gate;
      const recorded = await actual.recordCompetitionFixture(...args);
      if (gate) await gate;
      return recorded;
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

function leagueTeam(name: string): Team {
  const team = new TeamBuilder()
    .withId(name)
    .withName(name)
    .withPlayers(7)
    .withTreasury(10_000)
    .build();
  team.advancementMode = "advanced-league";
  return team;
}

async function cup(id: string, names: string[], prize?: number) {
  const entrants: CompetitionEntrant[] = names.map((name, index) => ({
    id: `local:${name}`,
    teamId: name,
    ownerUid: null,
    name,
    rosterName: "Human",
    seed: index + 1,
  }));
  const fixtures = generateSingleElimination(entrants);
  const doc: TournamentDoc = {
    id,
    type: "tournament",
    format: "single-elimination",
    name: id,
    organizerUid: null,
    participantUids: [],
    status: "active",
    entrants,
    fixtures,
    standings: computeStandings(entrants, fixtures),
    createdAt: 1,
    updatedAt: 1,
    ...(prize ? { prize } : {}),
  };
  await saveCompetition(doc);
}

let navigateTo: NavigateFunction;
function Navigator() {
  navigateTo = useNavigate();
  return null;
}

const flush = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

describe("a change that finishes after the route moved", () => {
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

  it("shows the new competition and sends later actions to it", async () => {
    saveTeams(["Reavers", "Badgers", "Wolves", "Hawks"].map(leagueTeam));
    await cup("cup-a", ["Reavers", "Badgers"], 100_000);
    await cup("cup-b", ["Wolves", "Hawks"]);
    // One mounted page: the route moves between competitions under it
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={["/tournaments/cup-a"]}>
          <Routes>
            <Route
              path="/tournaments/:id"
              element={
                <>
                  <Navigator />
                  <CompetitionView type="tournament" />
                </>
              }
            />
          </Routes>
        </MemoryRouter>
      );
    });
    const field = (label: string) =>
      container.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`);
    const recordButton = () =>
      [...container.querySelectorAll("button")].find(
        (button) => button.textContent === "Record result"
      )!;
    const heading = () => container.querySelector("h1")?.textContent;
    expect(heading()).toBe("cup-a");

    // Record cup A's final; the page has not heard back yet
    let release!: () => void;
    hold.gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await act(async () => typeInto(field("Reavers score")!, "2"));
    await act(async () => typeInto(field("Badgers score")!, "0"));
    await act(async () => recordButton().click());

    // The coach moves on to cup B
    hold.gate = null;
    await act(async () => navigateTo("/tournaments/cup-b"));
    await flush();
    expect(heading()).toBe("cup-b");
    expect(field("Wolves score")).not.toBeNull();

    // Cup A's write finishes last
    await act(async () => {
      release();
    });
    await flush();
    expect(heading()).toBe("cup-b");
    expect(container.textContent).not.toContain("Champion: Reavers");
    expect(field("Wolves score")).not.toBeNull();

    // Later actions go to cup B
    await act(async () => typeInto(field("Wolves score")!, "1"));
    await act(async () => typeInto(field("Hawks score")!, "0"));
    await act(async () => recordButton().click());
    await flush();
    expect(container.textContent).toContain("Champion: Wolves");
    const storedB = (await getCompetition("tournament", "cup-b"))!;
    expect(storedB.status).toBe("complete");
    expect(storedB.type === "tournament" && storedB.championEntrantId).toBe(
      "local:Wolves"
    );

    // Cup A was recorded once, and its prize paid once
    const storedA = (await getCompetition("tournament", "cup-a"))!;
    expect(storedA.type === "tournament" && storedA.championEntrantId).toBe(
      "local:Reavers"
    );
    expect(getTeamById("Reavers")?.treasury).toBe(110_000);
    expect(getTeamById("Wolves")?.treasury).toBe(10_000);
  });
});
