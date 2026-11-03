import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * The coach whose turn it is owes a decision of their own when their time
 * runs out. In the round 5 two-machine match (3 November 2026) the block
 * card for one never showed after a tab came back, the clock waited on the
 * decision forever, and both screens sat on Time up for 23 minutes. Their
 * clock now gives the decision's default answer, as the other coach's short
 * clock does, so the turn can end.
 */

vi.mock("../../src/firebase/lobby", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../src/firebase/lobby")>();
  return {
    ...actual,
    setTurnDeadline: vi.fn(() => Promise.resolve()),
    pauseClock: vi.fn(() => Promise.resolve()),
    resumeClock: vi.fn(() => Promise.resolve()),
  };
});

const endTurn = vi.fn();
const state = { turn: { teamId: "host-team", turnNumber: 3, isHalf2: false } };
vi.mock("../../src/services/ServiceContainer", () => ({
  ServiceContainer: {
    isInitialized: () => true,
    getInstance: () => ({
      gameService: {
        getPhase: () => "PLAY",
        getActiveTeamId: () => state.turn.teamId,
        getState: () => state,
        getTeam: () => ({ name: "Reikland Reavers" }),
        endTurn,
      },
    }),
  },
}));

import { TurnClock } from "../../src/ui/pages/TurnClock";
import { EventBus } from "../../src/services/EventBus";
import { LobbyDoc } from "../../src/firebase/lobby";
import { OnlineMatch } from "../../src/network/OnlineMatch";
import { AuthUser } from "../../src/firebase/auth";
import { PendingDecision } from "../../src/headless/protocol";

const expiredLobby = (): LobbyDoc =>
  ({
    code: "ABC123",
    hostUid: "host-uid",
    guestUid: "guest-uid",
    status: "active",
    settings: { turnSeconds: 120, timeoutBankMs: 0, progressionEnabled: false },
    players: {},
    createdAt: null,
    timer: {
      deadline: Date.now() - 200,
      turn: "host-team:1:3",
      pausedBy: null,
      pausedAt: null,
      banks: {},
    },
  }) as unknown as LobbyDoc;

const blockDice: PendingDecision = {
  type: "block-dice",
  attackerId: "catcher-5",
  defenderId: "blitzer-2",
  chooserTeamId: "host-team",
  options: ["POW", "SKULL"] as never,
  choiceStage: "pick",
};

describe("the acting coach's clock runs out on their own decision", () => {
  afterEach(() => {
    vi.useRealTimers();
    endTurn.mockClear();
  });

  it("picks the default answer, and the turn ends once nothing is open", async () => {
    vi.useFakeTimers();
    let pending: PendingDecision | null = blockDice;
    const run = vi.fn(async () => {
      pending = null;
      return { ok: true };
    });
    const match = {
      role: "host",
      myTeamId: "host-team",
      opponentName: "Other",
      coachName: () => "Other",
      pendingDecision: () => pending,
      decidingTeamId: () => pending?.chooserTeamId ?? null,
      setClockPaused: vi.fn(),
      run,
    } as unknown as OnlineMatch;
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () =>
      root.render(
        <TurnClock
          code="ABC123"
          lobby={expiredLobby()}
          match={match}
          eventBus={new EventBus()}
          user={{ uid: "host-uid" } as AuthUser}
        />
      )
    );

    await act(async () => vi.advanceTimersByTimeAsync(600));
    expect(run.mock.calls).toEqual([
      [{ type: "choose-block-result", index: 0 }],
    ]);
    expect(endTurn).not.toHaveBeenCalled();

    await act(async () => vi.advanceTimersByTimeAsync(600));
    expect(endTurn).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledTimes(1);

    await act(async () => root.unmount());
    container.remove();
  });
});
