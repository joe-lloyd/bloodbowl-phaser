import { fixtureValue } from "../../src/testing/fixtureValue";
import { act } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { GameEventNames } from "../../src/types/events";
import { MatchResultsScreen } from "../../src/ui/components/hud/MatchResultsScreen";
import {
  type OnlineMatch,
  setActiveOnlineMatch,
} from "../../src/network/OnlineMatch";
import { recordCompetitionFixture } from "../../src/competition/resultRecording";
import {
  loadTeams,
  setTeamRepository,
} from "../../src/game/managers/TeamManager";
import { TeamBuilder as TeamBuilderPage } from "../../src/ui/components/pages/TeamBuilder";
import { leagueOf, resultsHarness, setup } from "./matchResultsScreenHarness";

const clearActiveMatchCode = vi.fn(() => Promise.resolve());
vi.mock("../../src/firebase/lobby", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/firebase/lobby")>()),
  clearActiveMatchCode: (uid: string) => clearActiveMatchCode(uid),
}));
vi.mock("../../src/firebase/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/firebase/auth")>()),
  getCurrentUser: () => ({ uid: "coach-uid" }),
}));

vi.mock("../../src/firebase/config", () => ({
  isFirebaseConfigured: vi.fn(() => false),
  getDb: vi.fn(),
}));

describe("MatchResultsScreen", () => {
  const h = resultsHarness();

  it("retries fixture recording and waits for this client's saved teams even when the fixture is complete", async () => {
    localStorage.clear();
    const { services, state, team1, team2 } = setup(true);
    team1.advancementMode = "advanced-league";
    team2.advancementMode = "advanced-league";
    state.paysWinnings = true;
    const league = await leagueOf([team1, team2]);
    const fixtureContext = {
      competitionType: "league" as const,
      competitionId: league.id,
      fixtureId: fixtureValue(league.fixtures[0]).id,
    };
    await recordCompetitionFixture({
        context: fixtureContext,homeScore: 1,awayScore: 0,progressedTeams: {
          home: team1,
          away: team2,
        }
      });
    let cache = loadTeams();
    let fail = true;
    let acknowledge!: () => void;
    const written = new Promise<void>((resolve) => {
      acknowledge = resolve;
    });
    setTeamRepository({
      loadTeams: () => cache,
      saveTeams: (teams) => {
        cache = teams;
        return fail ? Promise.reject(new Error("Cloud offline")) : written;
      },
      deleteTeam: () => {},
    });
    services.eventBus.emit(GameEventNames.PlayerActivated, fixtureValue(team1.players[0]).id);
    services.eventBus.emit(GameEventNames.PlayerActivated, fixtureValue(team2.players[0]).id);
    await act(async () => {
      h.root.render(
        <MemoryRouter>
          <MatchResultsScreen visible fixtureContext={fixtureContext} />
        </MemoryRouter>
      );
    });
    expect(h.container.textContent).toContain(
      "The competition result could not be saved. Cloud offline"
    );
    for (const button of [...h.container.querySelectorAll("button")].filter(
      (b) => b.textContent?.includes("Roll MVP D6")
    ))
      await act(async () => {
        button.click();
      });
    const confirm = () =>
      fixtureValue([...h.container.querySelectorAll("button")].find((b) =>
        b.textContent?.includes("Confirm and assign SPP")
      ));
    expect(confirm().disabled).toBe(true);
    fail = false;
    const retry = fixtureValue([...h.container.querySelectorAll("button")].find((b) =>
      b.textContent?.includes("Retry saving result")
    ));
    await act(async () => {
      retry.click();
    });
    expect(confirm().disabled).toBe(true);
    await act(async () => {
      acknowledge();
    });
    expect(confirm().disabled).toBe(false);
    expect(h.container.textContent).toContain(
      "Competition fixture result recorded"
    );
    expect(
      loadTeams().map((team) => ({ wins: team.wins, losses: team.losses }))
    ).toEqual([
      { wins: 1, losses: 0 },
      { wins: 0, losses: 1 },
    ]);
  });

  it.each([
    {
      result: "a win",
      score: [1, 0],
      home: { wins: 1, draws: 0, losses: 0, touchdowns: 1 },
      away: { wins: 0, draws: 0, losses: 1, touchdowns: 0 },
    },
    {
      result: "a draw",
      score: [1, 1],
      home: { wins: 0, draws: 1, losses: 0, touchdowns: 1 },
      away: { wins: 0, draws: 1, losses: 0, touchdowns: 1 },
    },
  ])(
    "keeps $result recorded at full time when SPP is confirmed",
    async ({ score, home, away }) => {
      localStorage.clear();
      const { services, state, team1, team2 } = setup(true);
      const league = await leagueOf([team1, team2]);
      state.score["team-1"] = score[0];
      state.score["team-2"] = score[1];
      services.eventBus.emit(
        GameEventNames.PlayerActivated,
        fixtureValue(team1.players[0]).id
      );
      services.eventBus.emit(
        GameEventNames.PlayerActivated,
        fixtureValue(team2.players[0]).id
      );

      const fixture = league.fixtures[0];
      await recordCompetitionFixture(
      {
        context: {
          competitionType: "league",
          competitionId: league.id,
          fixtureId: fixtureValue(fixture).id,
        },homeScore: fixtureValue(score[0]),awayScore: fixtureValue(score[1]),progressedTeams: { home: team1,away: team2 }
      }      );

      await h.render();
      for (const button of [...h.container.querySelectorAll("button")].filter(
        (b) => b.textContent?.includes("Roll MVP D6")
      )) {
        await act(async () => {
          button.click();
        });
      }
      const confirm = fixtureValue([...h.container.querySelectorAll("button")].find((b) =>
        b.textContent?.includes("Confirm and assign SPP")
      ));
      await act(async () => {
        confirm.click();
      });

      const stored = (id: string) =>
        fixtureValue(loadTeams().find((team) => team.id === id));
      const key = `${league.id}:${fixtureValue(fixture).id}`;
      expect(stored("team-1")).toMatchObject({
        ...home,
        recordedFixtureIds: [key],
      });
      expect(stored("team-2")).toMatchObject({
        ...away,
        recordedFixtureIds: [key],
      });

      expect(stored("team-1").activeCompetitionId).toBeUndefined();
      expect(stored("team-2").activeCompetitionId).toBeUndefined();

      expect(fixtureValue(stored("team-1").players[0]).spp).toBeGreaterThan(0);
    }
  );

  it("confirms a league game and opens the human team's management before returning to the league", async () => {
    localStorage.clear();
    const { services, state, team1, team2 } = setup(true);
    team1.advancementMode = "advanced-league";
    team2.advancementMode = "advanced-league";
    const league = await leagueOf([team1, team2]);
    state.paysWinnings = true;
    state.score["team-1"] = 0;
    state.score["team-2"] = 2;
    services.eventBus.emit(GameEventNames.PlayerActivated, fixtureValue(team1.players[0]).id);
    services.eventBus.emit(GameEventNames.PlayerActivated, fixtureValue(team2.players[0]).id);
    await recordCompetitionFixture(
    {
      context: {
        competitionType: "league",
        competitionId: league.id,
        fixtureId: fixtureValue(league.fixtures[0]).id,
      },homeScore: 0,awayScore: 2,progressedTeams: { home: team1,away: team2 }
    }    );

    const runProgressionCommand = vi.fn(
      async (command: { teamId: string; nominatedPlayerIds: string[] }) => {
        services.matchStats.awardMvp(
          command.teamId,
          command.nominatedPlayerIds,
          1
        );
        return { ok: true, events: [] };
      }
    );
    setActiveOnlineMatch({
      kind: "computer",
      myTeamId: "team-1",
      mayAct: () => true,
      runProgressionCommand,
    } as unknown as OnlineMatch);
    try {
      await act(async () => {
        h.root.render(
          <MemoryRouter initialEntries={["/play/computer"]}>
            <Routes>
              <Route
                path="/play/computer"
                element={
                  <MatchResultsScreen
                    visible={true}
                    leaveTo="/leagues/season-1"
                    fixtureContext={{
                      competitionType: "league",
                      competitionId: league.id,
                      fixtureId: fixtureValue(league.fixtures[0]).id,
                    }}
                  />
                }
              />
              <Route path="/leagues/:id" element={<p>The league page</p>} />
              <Route path="/build-team/:teamId" element={<TeamBuilderPage />} />
            </Routes>
          </MemoryRouter>
        );
      });

      expect(runProgressionCommand).toHaveBeenCalledWith({
        type: "award-mvp",
        teamId: "team-2",
        nominatedPlayerIds: [fixtureValue(team2.players[0]).id],
      });
      const rolls = [...h.container.querySelectorAll("button")].filter((b) =>
        b.textContent?.includes("Roll MVP D6")
      );
      expect(rolls).toHaveLength(1);
      await act(async () => {
        fixtureValue(rolls[0]).click();
      });
      const confirm = fixtureValue([...h.container.querySelectorAll("button")].find((b) =>
        b.textContent?.includes("Confirm and assign SPP")
      ));
      await act(async () => {
        confirm.click();
      });

      const stored = (id: string) =>
        fixtureValue(loadTeams().find((team) => team.id === id));
      expect(stored("team-1")).toMatchObject({ losses: 1, wins: 0 });

      expect(stored("team-2")).toMatchObject({ wins: 1, touchdowns: 2 });
      expect(fixtureValue(stored("team-2").players[0]).spp).toBeGreaterThan(0);

      expect(h.container.textContent).toContain("Post-match team management");
      expect(
        h.container
          .querySelector('input[placeholder="Enter Team Name"]')
          ?.getAttribute("value")
      ).toBe("Reikland Reavers");
      const finish = fixtureValue([...h.container.querySelectorAll("button")].find((b) =>
        b.textContent?.includes("Finish post-match")
      ));
      await act(async () => {
        finish.click();
      });
      expect(h.container.textContent).toBe("The league page");
    } finally {
      setActiveOnlineMatch(null);
    }
  });

  it("shows each team's league winnings once the fixture is recorded", async () => {
    const { services, state } = setup(false);
    state.score["team-1"] = 2;
    state.score["team-2"] = 1;
    fixtureValue(services.gameService.getTeam("team-1")).advancementMode =
      "sevens-skill-selection";
    fixtureValue(services.gameService.getTeam("team-2")).advancementMode = "advanced-league";

    await h.render();
    expect(
      h.container.querySelector('[data-testid="match-winnings"]')
    ).toBeNull();

    await act(async () => {
      services.eventBus.emit(GameEventNames.CompetitionResultRecorded, {
        fixtureId: "f1",
        winnings: { "team-1": 60_000, "team-2": 50_000 },
        fanFactors: { "team-1": 4, "team-2": 4 },
      });
    });

    const panel = fixtureValue(h.container.querySelector('[data-testid="match-winnings"]'));
    expect(panel.textContent).toContain("Fan Attendance 8");
    expect(
      h.container.querySelector('[data-testid="match-winnings-team-1"]')
        ?.textContent
    ).toBe("Reikland Reavers: +60,000 gp to the Treasury");
    expect(
      h.container.querySelector('[data-testid="match-winnings-team-2"]')
        ?.textContent
    ).toBe("Bad Badgers: +50,000 gp to the Treasury");
  });
});
