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
import { setMatchSaveRepository } from "../../src/game/persistence/MatchSaveRepository";
import { loadTeams, saveTeams } from "../../src/game/managers/TeamManager";
import { resultsHarness, setup } from "./matchResultsScreenHarness";
import { InjuryType } from "../../src/types/Player";

const clearActiveMatchCode = vi.fn<[uid: string], Promise<void>>(() => Promise.resolve());
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

const press = (button: HTMLButtonElement) =>
  act(async () => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Promise.resolve();
  });

describe("MatchResultsScreen", () => {
  const h = resultsHarness();

  it("holds the exit until MVP/SPP is confirmed for a progression-eligible match", async () => {
    const { services, state, team1, team2 } = setup(true);
    state.score["team-1"] = 1;
    state.score["team-2"] = 0;

    services.eventBus.emit(GameEventNames.PlayerActivated, fixtureValue(team1.players[0]).id);
    services.eventBus.emit(GameEventNames.PlayerActivated, fixtureValue(team2.players[0]).id);

    await h.render();

    let exitButton = fixtureValue([...h.container.querySelectorAll("button")].find((b) =>
      b.textContent?.includes("Continue to Main Menu")
    ));
    expect(exitButton.disabled).toBe(true);

    const rollButtons = [...h.container.querySelectorAll("button")].filter(
      (b) => b.textContent?.includes("Roll MVP D6")
    );
    expect(rollButtons).toHaveLength(2);
    for (const button of rollButtons) {
      await act(async () => {
        button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
    }

    const confirmButton = fixtureValue([...h.container.querySelectorAll("button")].find(
      (b) => b.textContent?.includes("Confirm and assign SPP")
    ));
    expect(confirmButton.disabled).toBe(false);
    await act(async () => {
      confirmButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    exitButton = fixtureValue([...h.container.querySelectorAll("button")].find((b) =>
      b.textContent?.includes("Continue to Main Menu")
    ));
    expect(exitButton.disabled).toBe(false);
  });

  it("lets a club keep the SPP from a friendly the coach chose to count", async () => {
    localStorage.clear();
    const { services, team1, team2 } = setup(true);
    team1.club = {};
    team1.advancementMode = "advanced-league";
    team2.advancementMode = "advanced-league";
    await saveTeams([team1, team2]);
    services.eventBus.emit(GameEventNames.PlayerActivated, fixtureValue(team1.players[0]).id);
    services.eventBus.emit(GameEventNames.PlayerActivated, fixtureValue(team2.players[0]).id);

    await h.render();
    const click = (label: string) =>
      [...h.container.querySelectorAll("button")].filter((b) =>
        b.textContent.includes(label)
      );
    for (const button of click("Roll MVP D6")) await press(button);
    await press(fixtureValue(click("Confirm and assign SPP")[0]));

    const spp = (id: string) =>
      fixtureValue(loadTeams().find((team) => team.id === id)).players.reduce(
        (sum, player) => sum + player.spp,
        0
      );
    expect(spp("team-1")).toBe(4);
    expect(spp("team-2")).toBe(4);
  });

  it("does not keep a player who joined during a counted friendly", async () => {
    localStorage.clear();
    const { services, team1, team2 } = setup(true);
    team1.club = {};
    team1.advancementMode = "advanced-league";
    await saveTeams([team1, team2]);
    const starters = team1.players.map((player) => player.id);
    team1.players.push({
      ...fixtureValue(team1.players[0]),
      id: "plague-ridden-rotter",
      number: 12,
    });
    services.eventBus.emit(GameEventNames.PlayerActivated, fixtureValue(team1.players[0]).id);
    services.eventBus.emit(GameEventNames.PlayerActivated, fixtureValue(team2.players[0]).id);

    await h.render();
    const buttons = (label: string) =>
      [...h.container.querySelectorAll("button")].filter((b) =>
        b.textContent.includes(label)
      );
    for (const button of buttons("Roll MVP D6")) {
      act(() => {
        button.click();
      });
    }
    act(() => {
      fixtureValue(buttons("Confirm and assign SPP")[0]).click();
    });
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)));

    const saved = fixtureValue(loadTeams().find((team) => team.id === team1.id));
    expect(saved.players.map((player) => player.id)).toEqual(starters);
  });

  it("keeps confirmed SPP and the match save when storage fails, then retries without another award", async () => {
    localStorage.clear();
    const { services, state, team1, team2 } = setup(true);
    team1.advancementMode = "advanced-league";
    team2.advancementMode = "advanced-league";
    state.paysWinnings = true;
    saveTeams([team1, team2]);
    services.eventBus.emit(GameEventNames.PlayerActivated, fixtureValue(team1.players[0]).id);
    services.eventBus.emit(GameEventNames.PlayerActivated, fixtureValue(team2.players[0]).id);
    const clear = vi.fn();
    setMatchSaveRepository({
      read: () => null,
      write: () => {},
      clear,
      describe: () => null,
    });
    await act(async () => {
      h.root.render(
        <MemoryRouter initialEntries={["/play"]}>
          <Routes>
            <Route
              path="/play"
              element={
                <MatchResultsScreen visible leaveTo="/leagues/season-1" />
              }
            />
            <Route
              path="/build-team/:teamId"
              element={<p>Team management</p>}
            />
          </Routes>
        </MemoryRouter>
      );
    });
    const rollButtons = [...h.container.querySelectorAll("button")].filter(
      (b) => b.textContent?.includes("Roll MVP D6")
    );
    for (const button of rollButtons)
      await act(async () => {
        button.click();
      });
    const write = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("Storage full");
      });
    const confirm = fixtureValue([...h.container.querySelectorAll("button")].find((b) =>
      b.textContent?.includes("Confirm and assign SPP")
    ));
    await act(async () => {
      confirm.click();
    });
    expect(h.container.textContent).toContain("Full Time");
    expect(h.container.textContent).toContain("Storage full");
    expect(clear).not.toHaveBeenCalled();
    write.mockRestore();
    const retry = fixtureValue([...h.container.querySelectorAll("button")].find((b) =>
      b.textContent?.includes("Retry saving team")
    ));
    await act(async () => {
      retry.click();
    });
    expect(h.container.textContent).toBe("Team management");
    expect(loadTeams().map((team) => fixtureValue(team.players[0]).spp)).toEqual([4, 4]);
    expect(clear).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["a friendly forgets", false, []],
    ["a tournament game keeps", true, [InjuryType.MISS_NEXT_GAME]],
  ] as const)(
    "%s the injuries a league team suffered",
    async (_name, competition, kept) => {
      localStorage.clear();
      const { services, state, team1, team2 } = setup(true);
      team1.advancementMode = "advanced-league";
      team2.advancementMode = "advanced-league";
      if (competition) state.competition = true;
      await saveTeams([team1, team2]);
      fixtureValue(team1.players[0]).injuries.push(InjuryType.MISS_NEXT_GAME);
      services.eventBus.emit(GameEventNames.PlayerActivated, fixtureValue(team1.players[0]).id);
      services.eventBus.emit(GameEventNames.PlayerActivated, fixtureValue(team2.players[0]).id);
      await h.render();
      const buttons = (label: string) =>
        [...h.container.querySelectorAll("button")].filter((b) =>
          b.textContent.includes(label)
        );
      for (const button of buttons("Roll MVP D6")) {
        act(() => {
          button.click();
        });
      }
      act(() => {
        fixtureValue(buttons("Confirm and assign SPP")[0]).click();
      });
      await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
      const saved = loadTeams().find((team) => team.id === team1.id);
      expect(fixtureValue(saved?.players[0]).injuries).toEqual(kept);
    }
  );

  it("lets the coach roll the computer's MVP when it did not roll by itself", async () => {
    const { services, state, team1, team2 } = setup(true);
    state.score["team-1"] = 1;
    state.score["team-2"] = 0;
    services.eventBus.emit(GameEventNames.PlayerActivated, fixtureValue(team1.players[0]).id);
    services.eventBus.emit(GameEventNames.PlayerActivated, fixtureValue(team2.players[0]).id);
    let refuse = true;
    const runProgressionCommand = vi.fn(
      async (command: { teamId: string; nominatedPlayerIds: string[] }) => {
        if (refuse) return { ok: false, reason: "engine busy", events: [] };
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
      await h.render();
      expect(h.container.textContent).toContain("engine busy");
      const rolls = [...h.container.querySelectorAll("button")].filter((b) =>
        b.textContent?.includes("Roll MVP D6")
      );

      expect(rolls).toHaveLength(2);
      refuse = false;
      for (const roll of rolls)
        await act(async () => {
          roll.click();
        });
      const confirm = fixtureValue([...h.container.querySelectorAll("button")].find((b) =>
        b.textContent?.includes("Confirm and assign SPP")
      ));
      expect(confirm.disabled).toBe(false);
    } finally {
      setActiveOnlineMatch(null);
    }
  });
});
