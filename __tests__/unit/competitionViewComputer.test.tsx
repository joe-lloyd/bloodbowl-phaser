import { fixtureValue } from "../../src/testing/fixtureValue";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/firebase/config", () => ({
  isFirebaseConfigured: vi.fn(() => false),
  getDb: vi.fn(),
}));

import { createCompetition } from "../../src/competition/create";
import { createComputerTeam } from "../fixtures/computerTeam";
import { getCompetition } from "../../src/competition/repository";
import { withdrawFromCompetition } from "../../src/competition/resultRecording";
import { type CompetitionDoc } from "../../src/competition/types";
import { saveTeam } from "../../src/game/managers/TeamManager";
import { createReadyMadeTeam } from "../../src/simulation/lineups";
import { RosterName, type Team } from "../../src/types/Team";
import { CompetitionView } from "../../src/ui/components/pages/CompetitionView";

function LaunchedMatch() {
  const state = useLocation().state as Record<string, unknown>;
  return (
    <output data-testid="launched">
      {JSON.stringify({
        computerTeamId: state["computerTeamId"],
        difficulty: state["difficulty"],
        progressionEnabled: state["progressionEnabled"],
        competitionContext: state["competitionContext"],
      })}
    </output>
  );
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
  await act(async () => {
    root.unmount();
  });
  container.remove();
});

const button = (label: string) =>
  [...container.querySelectorAll("button")].find(
    (candidate) => candidate.textContent === label
  );
const buttons = (label: string) =>
  [...container.querySelectorAll("button")].filter(
    (candidate) => candidate.textContent === label
  );
const launched = () =>
  JSON.parse(
    fixtureValue(container.querySelector('[data-testid="launched"]')).textContent
  ) as Record<string, unknown>;

async function show(competition: CompetitionDoc) {
  const route = competition.type === "league" ? "leagues" : "tournaments";
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[`/${route}/${competition.id}`]}>
        <Routes>
          <Route
            path="/leagues/:id"
            element={<CompetitionView type="league" />}
          />
          <Route
            path="/tournaments/:id"
            element={<CompetitionView type="tournament" />}
          />
          <Route path="/play/computer" element={<LaunchedMatch />} />
        </Routes>
      </MemoryRouter>
    );
  });
}

function computerTeams(...rosters: RosterName[]): Team[] {
  return rosters.map((roster, index) =>
    createComputerTeam({ rosterName: roster, name: `${roster} XI`, primaryColour: 0x224488 + index, advancementMode: "advanced-league" })
  );
}

describe("a league against the computer", () => {
  let mine: Team;
  let rivals: Team[];
  let league: CompetitionDoc;

  beforeEach(async () => {
    mine = createReadyMadeTeam(RosterName.HUMAN, "My Team", 0xaa2222);
    mine.advancementMode = "advanced-league";
    saveTeam(mine);
    rivals = computerTeams(RosterName.ORC, RosterName.SKAVEN, RosterName.DWARF);
    league = await createCompetition({
      type: "league",
      name: "Season 1",
      organizerUid: null,
      entrants: [mine, ...rivals].map((team) => ({ team, ownerUid: null })),
      computerDifficulty: "hard",
    });
  });

  it("plays my game against the computer, as a league game", async () => {
    await show(league);
    const mineFirst = fixtureValue(league.fixtures.find((fixture) =>
      [fixture.homeEntrantId, fixture.awayEntrantId].includes(`own:${mine.id}`)
    ));
    const opponentEntrant =
      mineFirst.homeEntrantId === `own:${mine.id}`
        ? mineFirst.awayEntrantId
        : mineFirst.homeEntrantId;

    expect(buttons("Play vs computer")).toHaveLength(3);
    await act(async () => {
      fixtureValue(button("Play vs computer")).click();
    });

    expect(launched()).toEqual({
      computerTeamId: fixtureValue(opponentEntrant).replace("computer:", ""),
      difficulty: "hard",
      progressionEnabled: true,
      competitionContext: {
        ruleset: "gw-2025",
        competitionType: "league",
        competitionId: league.id,
        fixtureId: mineFirst.id,
      },
    });
  });

  it("lets me take over either side of a computer game", async () => {
    await show(league);
    const computerGame = fixtureValue(league.fixtures.find(
      (fixture) =>
        fixture.homeEntrantId?.startsWith("computer:") &&
        fixture.awayEntrantId?.startsWith("computer:")
    ));
    const name = (entrantId: string | null) =>
      fixtureValue(league.entrants.find((entrant) => entrant.id === entrantId)).name;
    await act(async () => {
      fixtureValue(button(`Play as ${name(computerGame.homeEntrantId)}`)).click();
    });

    expect(launched()).toMatchObject({
      computerTeamId: fixtureValue(computerGame.awayEntrantId).replace("computer:", ""),
      competitionContext: { fixtureId: computerGame.id },
    });
  });

  it("simulates a round's computer games and shows what happened", async () => {
    await show(league);

    expect(buttons("Simulate")).toHaveLength(1);
    await act(async () => {
      fixtureValue(button("Simulate round 1")).click();
    });
    await vi.waitFor(
      () => {
        expect(container.textContent).not.toContain("Simulating");
      },
      { timeout: 30_000 }
    );

    const stored = fixtureValue((await getCompetition("league", league.id)));
    const roundOne = stored.fixtures.filter((fixture) => fixture.round === 1);
    const simulated = roundOne.filter(
      (fixture) => fixture.status === "complete"
    );

    expect(simulated).toHaveLength(1);
    expect(roundOne).toHaveLength(2);
    const { homeScore, awayScore } = fixtureValue(fixtureValue(simulated[0]).result);
    const results = [...container.querySelectorAll("section")].find((section) =>
      section.textContent?.startsWith("Simulated results")
    );
    expect(results?.textContent).toContain(`Round 1`);
    expect(results?.textContent).toContain(
      `${String(homeScore)}–${String(awayScore)}`
    );

    expect(
      stored.fixtures.filter(
        (fixture) => fixture.round > 1 && fixture.status === "complete"
      )
    ).toEqual([]);

    expect(
      [...container.querySelectorAll("button")].filter((candidate) =>
        candidate.textContent?.startsWith("Simulate round")
      )
    ).toEqual([]);
    expect(buttons("Simulate")).toEqual([]);
  }, 60_000);

  it("moves on past my games once I withdraw", async () => {
    const withdrawn = await withdrawFromCompetition(
      { competitionType: "league", competitionId: league.id },
      `own:${mine.id}`
    );
    await show(withdrawn);

    expect(
      container.textContent?.match(/Walkover: My Team withdrew/g)
    ).toHaveLength(3);
    await act(async () => {
      fixtureValue(button("Simulate round 1")).click();
    });
    await vi.waitFor(
      () => {
        expect(button("Simulate round 2")).toBeDefined();
      },
      {
        timeout: 30_000,
      }
    );
  }, 60_000);
});

describe("a cup the computer plays", () => {
  it("simulates one round at a time through to a champion", async () => {
    const cup = await createCompetition({
      type: "tournament",
      format: "single-elimination",
      name: "The Cup",
      organizerUid: null,
      entrants: computerTeams(
        RosterName.ORC,
        RosterName.HUMAN,
        RosterName.SKAVEN,
        RosterName.DWARF
      ).map((team) => ({ team, ownerUid: null })),
    });
    await show(cup);
    await act(async () => {
      fixtureValue(button("Simulate round 1")).click();
    });
    await vi.waitFor(
      () => {
        expect(button("Simulate round 2")).toBeDefined();
      },
      {
        timeout: 60_000,
      }
    );

    expect(container.textContent).not.toContain("Champion:");
    await act(async () => {
      fixtureValue(button("Simulate round 2")).click();
    });
    await vi.waitFor(
      () => {
        expect(container.textContent).toContain("Champion:");
      },
      { timeout: 60_000 }
    );

    const stored = fixtureValue((await getCompetition("tournament", cup.id)));
    const champion = fixtureValue(stored.entrants.find(
      (entrant) =>
        stored.type === "tournament" && entrant.id === stored.championEntrantId
    ));
    expect(container.textContent).toContain(`Champion: ${champion.name}`);
    expect(
      [...container.querySelectorAll("button")].filter((candidate) =>
        candidate.textContent?.startsWith("Simulate")
      )
    ).toEqual([]);
  }, 90_000);
});
