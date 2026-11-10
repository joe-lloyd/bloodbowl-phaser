import { act } from "react";
import { createRoot, Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * End-to-end wiring for the "no time limit" host setting (turnSeconds: 0):
 * TurnClock must (a) write a null deadline instead of an expiring one when a
 * turn starts, (b) render nothing, and (c) never force-end the turn — not
 * just that nextTurnDeadline() returns null in isolation (TurnClock.test.ts)
 * or that the lobby select offers the option (onlineLobbySettingsPanel.test.tsx).
 */

const hoisted = vi.hoisted(() => ({
  setTurnDeadlineMock: vi.fn(() => Promise.resolve()),
  endTurnMock: vi.fn(),
  activeTeamId: "host-team",
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
        getActiveTeamId: () => hoisted.activeTeamId,
        getState: () => ({
          turn: { teamId: hoisted.activeTeamId, turnNumber: 1, isHalf2: false },
        }),
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

describe("TurnClock — no time limit end-to-end wiring", () => {
  let container: HTMLDivElement;
  let root: Root;
  let eventBus: EventBus;
  const code = "ABC123";
  const user = { uid: "host-uid" } as AuthUser;
  const match = {
    role: "host",
    myTeamId: "host-team",
    coachName: () => "Host Coach",
    pendingDecision: () => null,
    decidingTeamId: () => null,
    setClockPaused: vi.fn(),
  } as unknown as OnlineMatch;

  const noLimitLobby: LobbyDoc = {
    code,
    hostUid: "host-uid",
    guestUid: "guest-uid",
    status: "active",
    settings: {
      turnSeconds: 0,
      timeoutBankMs: 0,
      progressionEnabled: false,
    },
    players: {},
    createdAt: null,
    timer: { deadline: null, pausedBy: null, pausedAt: null, banks: {} },
  };

  beforeEach(() => {
    vi.useFakeTimers();
    hoisted.setTurnDeadlineMock.mockClear();
    hoisted.endTurnMock.mockClear();
    hoisted.activeTeamId = "host-team";
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    eventBus = new EventBus();
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("writes a null deadline (not an expiring one) when a turn starts", async () => {
    await act(async () => {
      root.render(
        <TurnClock
          code={code}
          lobby={noLimitLobby}
          match={match}
          eventBus={eventBus}
          user={user}
        />
      );
    });

    await act(async () => {
      eventBus.emit(GameEventNames.TurnStarted, {} as never);
    });

    expect(hoisted.setTurnDeadlineMock).toHaveBeenCalledWith(
      code,
      null,
      "host-team:1:1"
    );
  });

  it("renders nothing for a no-limit match", async () => {
    await act(async () => {
      root.render(
        <TurnClock
          code={code}
          lobby={noLimitLobby}
          match={match}
          eventBus={eventBus}
          user={user}
        />
      );
    });

    expect(container.textContent).toBe("");
    expect(container.querySelector("div")).toBeNull();
  });

  it("never force-ends the turn no matter how much time passes", async () => {
    await act(async () => {
      root.render(
        <TurnClock
          code={code}
          lobby={noLimitLobby}
          match={match}
          eventBus={eventBus}
          user={user}
        />
      );
    });

    // Well past any real turn timer, repeatedly, to exercise the 500ms
    // polling interval that would otherwise call endTurn() on expiry.
    await act(async () => {
      vi.advanceTimersByTime(30 * 60 * 1000);
    });

    expect(hoisted.endTurnMock).not.toHaveBeenCalled();
  });

  it.each(["host", "guest"] as const)(
    "leaves the %s's defensive choice open without an invisible timeout",
    async (role) => {
      hoisted.activeTeamId = role === "host" ? "guest-team" : "host-team";
      const myTeamId = `${role}-team`;
      const run = vi.fn(() => Promise.resolve({ ok: true }));
      const defenderMatch = {
        ...match,
        role,
        myTeamId,
        pendingDecision: () => ({
          type: "reaction",
          playerId: "defender",
          skill: "Stand Firm",
        }),
        decidingTeamId: () => myTeamId,
        run,
      } as unknown as OnlineMatch;

      await act(async () => {
        root.render(
          <TurnClock
            code={code}
            lobby={noLimitLobby}
            match={defenderMatch}
            eventBus={eventBus}
            user={{ uid: `${role}-uid` } as AuthUser}
          />
        );
      });
      await act(async () => vi.advanceTimersByTimeAsync(30 * 60 * 1000));

      expect(run).not.toHaveBeenCalled();
      expect(hoisted.endTurnMock).not.toHaveBeenCalled();
      expect(container.textContent).toBe("");
    }
  );

  it("ignores a leftover deadline in an untimed match", async () => {
    const announce = vi.fn();
    eventBus.on(GameEventNames.UI_Announce, announce);
    const lobby: LobbyDoc = {
      ...noLimitLobby,
      timer: {
        ...noLimitLobby.timer!,
        deadline: Date.now() - 1000,
        turn: "host-team:1:1",
      },
    };
    await act(async () => {
      root.render(
        <TurnClock
          code={code}
          lobby={lobby}
          match={match}
          eventBus={eventBus}
          user={user}
        />
      );
    });
    await act(async () => vi.advanceTimersByTimeAsync(2000));
    await act(async () => {
      eventBus.emit(GameEventNames.TurnEnded, { teamId: "host-team" });
    });

    expect(hoisted.endTurnMock).not.toHaveBeenCalled();
    expect(announce).not.toHaveBeenCalled();
    expect(container.textContent).toBe("");
  });

  it("does not restart a leftover deadline after a disconnect", async () => {
    const lobby: LobbyDoc = {
      ...noLimitLobby,
      timer: {
        ...noLimitLobby.timer!,
        deadline: Date.now() + 60_000,
        turn: "host-team:1:1",
      },
    };
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
    expect(match.setClockPaused).toHaveBeenLastCalledWith("opponent-away");
    await act(async () => vi.advanceTimersByTimeAsync(30 * 60 * 1000));
    await act(async () => render(false));

    expect(match.setClockPaused).toHaveBeenLastCalledWith(null);
    expect(hoisted.setTurnDeadlineMock).not.toHaveBeenCalled();
    expect(hoisted.endTurnMock).not.toHaveBeenCalled();
    expect(container.textContent).toBe("");
  });
});
