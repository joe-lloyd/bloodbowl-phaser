import { fixtureValue } from "../../src/testing/fixtureValue";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { GameEventNames } from "../../src/types/events";
import { MatchResultsScreen } from "../../src/ui/components/hud/MatchResultsScreen";
import {
  type OnlineMatch,
  setActiveOnlineMatch,
} from "../../src/network/OnlineMatch";
import { setMatchSaveRepository } from "../../src/game/persistence/MatchSaveRepository";
import {
  loadTeams,
  saveTeams,
  setTeamRepository,
} from "../../src/game/managers/TeamManager";
import { resultsHarness, setup } from "./matchResultsScreenHarness";

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

  it("clears the save when a match against the computer ends", async () => {
    setup(false);
    const clear = vi.fn();
    setMatchSaveRepository({
      read: () => null,
      write: () => {},
      clear,
      describe: () => null,
    });
    setActiveOnlineMatch({
      kind: "computer",
      myTeamId: "team-1",
      mayAct: () => true,
    } as unknown as OnlineMatch);
    try {
      await h.render();
      const exit = fixtureValue([...h.container.querySelectorAll("button")].find((b) =>
        b.textContent?.includes("Continue to Main Menu")
      ));
      await act(async () => {
        exit.click();
      });
      expect(clear).toHaveBeenCalledTimes(1);
    } finally {
      setActiveOnlineMatch(null);
      setMatchSaveRepository(null);
    }
  });

  it("drops the home screen's link to an online match once the coach leaves full time", async () => {
    setup(false);
    clearActiveMatchCode.mockClear();
    setActiveOnlineMatch({
      kind: "online",
      code: "ABCD",
      myTeamId: "team-1",
      mayAct: () => true,
    } as unknown as OnlineMatch);
    try {
      await h.render();
      expect(clearActiveMatchCode).not.toHaveBeenCalled();
      const exit = fixtureValue([...h.container.querySelectorAll("button")].find((b) =>
        b.textContent?.includes("Continue to Main Menu")
      ));
      await act(async () => {
        exit.click();
      });
      expect(clearActiveMatchCode).toHaveBeenCalledWith("coach-uid");
    } finally {
      setActiveOnlineMatch(null);
    }
  });

  it("records a game once, even when the page reloads before the coach leaves again", async () => {
    const { team1, team2 } = setup(false);
    saveTeams([structuredClone(team1), structuredClone(team2)]);
    const leaveFullTime = async () => {
      await h.render();
      const exit = fixtureValue([...h.container.querySelectorAll("button")].find((b) =>
        b.textContent?.includes("Continue to Main Menu")
      ));
      await act(async () => {
        exit.click();
      });
    };
    await leaveFullTime();

    await act(async () => {
      h.root.unmount();
    });
    h.root = createRoot(h.container);
    await leaveFullTime();

    expect(
      fixtureValue(loadTeams().find((team) => team.id === "team-1")).playedGames
    ).toHaveLength(1);
  });

  it("adds the game to each team's played games when the coach leaves", async () => {
    const { state, team1, team2 } = setup(false);
    state.score["team-1"] = 2;
    state.score["team-2"] = 1;
    saveTeams([structuredClone(team1), structuredClone(team2)]);

    await h.render();
    const exit = fixtureValue([...h.container.querySelectorAll("button")].find((b) =>
      b.textContent?.includes("Continue to Main Menu")
    ));
    await act(async () => {
      exit.click();
    });

    const played = (id: string) =>
      fixtureValue(loadTeams().find((team) => team.id === id)).playedGames;
    expect(played("team-1")).toMatchObject([
      {
        kind: "local",
        opponent: { name: "Bad Badgers" },
        score: { own: 2, opponent: 1 },
        outcome: "win",
      },
    ]);
    expect(played("team-2")).toMatchObject([
      { score: { own: 1, opponent: 2 }, outcome: "loss" },
    ]);
  });

  it("leaves full time while offline, with the played game still saving", async () => {
    const { team1, team2 } = setup(false);
    let cache = [structuredClone(team1), structuredClone(team2)];
    setTeamRepository({
      loadTeams: () => cache,

      saveTeams: (teams) => {
        cache = teams;
        return new Promise(() => {});
      },
      deleteTeam: () => {},
    });
    await act(async () => {
      h.root.render(
        <MemoryRouter initialEntries={["/play"]}>
          <Routes>
            <Route path="/play" element={<MatchResultsScreen visible />} />
            <Route path="/" element={<p>Main menu</p>} />
          </Routes>
        </MemoryRouter>
      );
    });
    const exit = fixtureValue([...h.container.querySelectorAll("button")].find((b) =>
      b.textContent?.includes("Continue to Main Menu")
    ));
    await act(async () => {
      exit.click();
    });
    expect(h.container.textContent).toContain("Main menu");
  });

  it("keeps a player who died in the game in the team's played games", async () => {
    const { services, team1, team2 } = setup(false);
    const fallen = team1.players[0];
    const line = (playerId: string, teamId: string, extra = {}) => ({
      playerId,
      teamId,
      participated: true,
      completions: 0,
      attempts: 0,
      superbThrows: 0,
      safeLandings: 0,
      interceptions: 0,
      casualties: 0,
      kills: 0,
      touchdowns: 0,
      mvps: 0,
      blocks: 0,
      yards: 0,
      injuriesSuffered: 0,
      sppEarned: 0,
      ...extra,
    });
    vi.spyOn(services.matchStats, "summary").mockReturnValue({
      progressionEnabled: false,
      players: [
        line(fixtureValue(fallen).id, "team-1", { touchdowns: 1, injuriesSuffered: 1 }),
        line(fixtureValue(team2.players[0]).id, "team-2"),
      ],
    });

    const stored = structuredClone(team1);
    stored.players = stored.players.filter((p) => p.id !== fixtureValue(fallen).id);
    saveTeams([stored, structuredClone(team2)]);

    await h.render();
    const exit = fixtureValue([...h.container.querySelectorAll("button")].find((b) =>
      b.textContent?.includes("Continue to Main Menu")
    ));
    await act(async () => {
      exit.click();
    });

    const played = fixtureValue(fixtureValue(loadTeams().find(
      (team) => team.id === "team-1"
    )).playedGames);
    expect(fixtureValue(played[0]).players).toMatchObject([
      { playerId: fixtureValue(fallen).id, touchdowns: 1, injured: true },
    ]);
  });

  it("keeps the played game when a later save of the team fails", async () => {
    const { services, state, team1, team2 } = setup(true);
    state.score["team-1"] = 1;
    services.eventBus.emit(GameEventNames.PlayerActivated, fixtureValue(team1.players[0]).id);
    services.eventBus.emit(GameEventNames.PlayerActivated, fixtureValue(team2.players[0]).id);
    let cache = [structuredClone(team1), structuredClone(team2)];
    let fail = false;
    setTeamRepository({
      loadTeams: () => cache,
      saveTeams: (teams) => {
        cache = teams;
        return fail
          ? Promise.reject(new Error("Cloud offline"))
          : Promise.resolve();
      },
      deleteTeam: () => {},
    });
    await h.render();
    const button = (text: string) =>
      fixtureValue([...h.container.querySelectorAll("button")].find((b) =>
        b.textContent?.includes(text)
      ));
    for (const roll of [...h.container.querySelectorAll("button")].filter((b) =>
      b.textContent?.includes("Roll MVP D6")
    ))
      await act(async () => {
        roll.click();
      });
    await act(async () => {
      button("Confirm and assign SPP").click();
    });

    fail = true;
    await act(async () => {
      button("Continue to Main Menu").click();
    });

    const played = (id: string) =>
      fixtureValue(cache.find((team) => team.id === id)).playedGames ?? [];
    expect(played("team-1")).toHaveLength(1);
    expect(played("team-2")).toHaveLength(1);
  });
});
