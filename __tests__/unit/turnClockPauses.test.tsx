import { act } from "react";
import { createRoot, Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The turn clock stops while the other coach is disconnected, and while
 * the coach whose turn it is NOT owns a decision; that coach then gets ten
 * seconds before their own screen answers with the default.
 *
 * (Harness shared with the "no time limit" tests: (turnSeconds: 0):
 * TurnClock must (a) write a null deadline instead of an expiring one when a
 * turn starts, (b) render nothing, and (c) never force-end the turn — not
 * just that nextTurnDeadline() returns null in isolation (TurnClock.test.ts)
 * or that the lobby select offers the option (onlineLobbySettingsPanel.test.tsx).
 */

const hoisted = vi.hoisted(() => ({
  setTurnDeadlineMock: vi.fn(() => Promise.resolve()),
  endTurnMock: vi.fn(),
}));

vi.mock("../../src/firebase/lobby", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../src/firebase/lobby")>();
  return {
    ...actual,
    setTurnDeadline: hoisted.setTurnDeadlineMock,
    pauseClock: vi.fn(() => Promise.resolve()),
    resumeClock: vi.fn(() => Promise.resolve()),
  };
});

// "PLAY" is GamePhase.PLAY's runtime value (types/GameState.ts); hardcoded
// here (rather than imported into the mock factory) to sidestep vi.mock
// hoisting/TDZ concerns.
vi.mock("../../src/services/ServiceContainer", () => ({
  ServiceContainer: {
    isInitialized: () => true,
    getInstance: () => ({
      gameService: {
        getPhase: () => "PLAY",
        // The host's turn: the active coach keeps the clock
        getActiveTeamId: () => "host-team",
        endTurn: hoisted.endTurnMock,
      },
    }),
  },
}));

import { TurnClock } from "../../src/ui/pages/TurnClock";
import { EventBus } from "../../src/services/EventBus";
import { GameEventNames } from "../../src/types/events";
import { LobbyDoc } from "../../src/firebase/lobby";
import { OnlineMatch } from "../../src/network/OnlineMatch";
import { AuthUser } from "../../src/firebase/auth";

describe("TurnClock pauses", () => {
  let container: HTMLDivElement;
  let root: Root;
  let eventBus: EventBus;
  const code = "ABC123";
  const user = { uid: "host-uid" } as AuthUser;
  const lobbyAt = (deadline: number): LobbyDoc =>
    ({
      code,
      hostUid: "host-uid",
      guestUid: "guest-uid",
      status: "active",
      settings: {
        turnSeconds: 120,
        timeoutBankMs: 0,
        progressionEnabled: false,
      },
      players: {},
      createdAt: null,
      timer: { deadline, pausedBy: null, pausedAt: null, banks: {} },
    }) as unknown as LobbyDoc;

  beforeEach(() => {
    vi.useFakeTimers();
    hoisted.setTurnDeadlineMock.mockClear();
    hoisted.endTurnMock.mockClear();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    eventBus = new EventBus();
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.useRealTimers();
  });

  it("stops while the other coach is away, then resumes with the time that was left", async () => {
    const match = {
      role: "host",
      myTeamId: "host-team",
      opponentName: "Guest",
      coachName: () => "Guest",
      pendingDecision: () => null,
      decidingTeamId: () => null,
      setClockPaused: vi.fn(),
    } as unknown as OnlineMatch;
    const lobby = lobbyAt(Date.now() + 60_000);
    const render = (opponentAway: boolean) =>
      root.render(
        <TurnClock
          code={code}
          lobby={lobby}
          match={match}
          eventBus={eventBus}
          user={user}
          opponentAway={opponentAway}
        />
      );

    await act(async () => render(true));
    await act(async () => vi.advanceTimersByTime(5 * 60 * 1000));
    expect(container.textContent).toContain("disconnected");
    expect(hoisted.endTurnMock).not.toHaveBeenCalled();
    expect(match.setClockPaused).toHaveBeenLastCalledWith(true);

    await act(async () => render(false));
    const [, deadline] = hoisted.setTurnDeadlineMock.mock.calls.at(
      -1
    ) as unknown as [string, number];
    // About the minute that was left when they dropped
    expect(deadline - Date.now()).toBeGreaterThan(59_000);
    expect(deadline - Date.now()).toBeLessThanOrEqual(60_000);
  });

  it("stops while the defender decides and answers for them after ten seconds", async () => {
    const run = vi.fn(() => Promise.resolve());
    const pending = {
      type: "block-dice",
      attackerId: "a1",
      defenderId: "d1",
      chooserTeamId: "guest-team",
      options: [{ type: "pow" }, { type: "skull" }],
    };
    // This screen is the defender's; the host's team is active
    const match = {
      role: "guest",
      myTeamId: "guest-team",
      opponentName: "Host",
      coachName: () => "Host",
      pendingDecision: () => pending,
      decidingTeamId: () => "guest-team",
      run,
      setClockPaused: vi.fn(),
    } as unknown as OnlineMatch;
    const lobby = lobbyAt(Date.now() + 60_000);
    await act(async () =>
      root.render(
        <TurnClock
          code={code}
          lobby={lobby}
          match={match}
          eventBus={eventBus}
          user={{ uid: "guest-uid" } as AuthUser}
        />
      )
    );
    await act(async () => vi.advanceTimersByTime(4_000));
    expect(container.textContent).toContain("to decide");
    expect(run).not.toHaveBeenCalled();

    await act(async () => vi.advanceTimersByTime(7_000));
    expect(run).toHaveBeenCalledWith({ type: "choose-block-result", index: 0 });
    expect(run).toHaveBeenCalledTimes(1);
  });
});
