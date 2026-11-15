/**
 * MVP and SPP on the full-time screen of a progression match.
 * The shared setup is in matchResultsScreenHarness.tsx.
 */
import { act } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { GameEventNames } from "../../src/types/events";
import { MatchResultsScreen } from "../../src/ui/components/hud/MatchResultsScreen";
import {
  OnlineMatch,
  setActiveOnlineMatch,
} from "../../src/network/OnlineMatch";
import { setMatchSaveRepository } from "../../src/game/persistence/MatchSaveRepository";
import { loadTeams, saveTeams } from "../../src/game/managers/TeamManager";
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

  it("holds the exit until MVP/SPP is confirmed for a progression-eligible match", async () => {
    const { services, state, team1, team2 } = setup(true);
    state.score["team-1"] = 1;
    state.score["team-2"] = 0;
    // One participant per team so the default MVP nomination is already
    // complete (no selection clicks required to enable the roll button).
    services.eventBus.emit(GameEventNames.PlayerActivated, team1.players[0].id);
    services.eventBus.emit(GameEventNames.PlayerActivated, team2.players[0].id);

    await h.render();

    let exitButton = [...h.container.querySelectorAll("button")].find((b) =>
      b.textContent?.includes("Continue to Main Menu")
    )!;
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

    const confirmButton = [...h.container.querySelectorAll("button")].find(
      (b) => b.textContent?.includes("Confirm and assign SPP")
    )!;
    expect(confirmButton.disabled).toBe(false);
    await act(async () => {
      confirmButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    exitButton = [...h.container.querySelectorAll("button")].find((b) =>
      b.textContent?.includes("Continue to Main Menu")
    )!;
    expect(exitButton.disabled).toBe(false);
  });

  it("keeps confirmed SPP and the match save when storage fails, then retries without another award", async () => {
    localStorage.clear();
    const { services, state, team1, team2 } = setup(true);
    team1.advancementMode = "advanced-league";
    team2.advancementMode = "advanced-league";
    state.paysWinnings = true;
    saveTeams([team1, team2]);
    services.eventBus.emit(GameEventNames.PlayerActivated, team1.players[0].id);
    services.eventBus.emit(GameEventNames.PlayerActivated, team2.players[0].id);
    const clear = vi.fn();
    setMatchSaveRepository({
      read: () => null,
      write: () => {},
      clear,
      describe: () => null,
    });
    await act(async () =>
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
      )
    );
    for (const button of [...h.container.querySelectorAll("button")].filter(
      (b) => b.textContent?.includes("Roll MVP D6")
    ))
      await act(async () => button.click());
    const write = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("Storage full");
      });
    const confirm = [...h.container.querySelectorAll("button")].find((b) =>
      b.textContent?.includes("Confirm and assign SPP")
    )!;
    await act(async () => confirm.click());
    expect(h.container.textContent).toContain("Full Time");
    expect(h.container.textContent).toContain("Storage full");
    expect(clear).not.toHaveBeenCalled();
    write.mockRestore();
    const retry = [...h.container.querySelectorAll("button")].find((b) =>
      b.textContent?.includes("Retry saving team")
    )!;
    await act(async () => retry.click());
    expect(h.container.textContent).toBe("Team management");
    expect(loadTeams().map((team) => team.players[0].spp)).toEqual([4, 4]);
    expect(clear).toHaveBeenCalledTimes(1);
  });

  it("lets the coach roll the computer's MVP when it did not roll by itself", async () => {
    const { services, state, team1, team2 } = setup(true);
    state.score["team-1"] = 1;
    state.score["team-2"] = 0;
    services.eventBus.emit(GameEventNames.PlayerActivated, team1.players[0].id);
    services.eventBus.emit(GameEventNames.PlayerActivated, team2.players[0].id);
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
      // The coach's own, and the computer's that failed
      expect(rolls).toHaveLength(2);
      refuse = false;
      for (const roll of rolls) await act(async () => roll.click());
      const confirm = [...h.container.querySelectorAll("button")].find((b) =>
        b.textContent?.includes("Confirm and assign SPP")
      )!;
      expect(confirm.disabled).toBe(false);
    } finally {
      setActiveOnlineMatch(null);
    }
  });
});
