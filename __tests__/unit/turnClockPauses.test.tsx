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
  state: { turn: { teamId: "host-team", turnNumber: 3, isHalf2: false } },
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
        getState: () => hoisted.state,
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
  const THIS_TURN = "host-team:1:3";
  const lobbyAt = (deadline: number, turn: string = THIS_TURN): LobbyDoc =>
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
      timer: { deadline, turn, pausedBy: null, pausedAt: null, banks: {} },
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
    expect(match.setClockPaused).toHaveBeenLastCalledWith("opponent-away");

    await act(async () => render(false));
    const [, deadline] = hoisted.setTurnDeadlineMock.mock.calls.at(
      -1
    ) as unknown as [string, number];
    // About the minute that was left when they dropped
    expect(deadline - Date.now()).toBeGreaterThan(59_000);
    expect(deadline - Date.now()).toBeLessThanOrEqual(60_000);
  });

  const hostMatch = () =>
    ({
      role: "host",
      myTeamId: "host-team",
      opponentName: "Guest",
      coachName: () => "Guest",
      pendingDecision: () => null,
      decidingTeamId: () => null,
      setClockPaused: vi.fn(),
    }) as unknown as OnlineMatch;

  it("does not end a new turn on the last turn's deadline before its own arrives", async () => {
    // The other coach's turn ran out a moment ago; this coach's turn has
    // just started and its fresh deadline has not come back yet
    const lobby = lobbyAt(Date.now() - 1_000, "guest-team:1:3");
    await act(async () =>
      root.render(
        <TurnClock
          code={code}
          lobby={lobby}
          match={hostMatch()}
          eventBus={eventBus}
          user={user}
        />
      )
    );
    await act(async () => vi.advanceTimersByTime(3_000));
    expect(hoisted.endTurnMock).not.toHaveBeenCalled();
    expect(container.textContent).toContain("2:00");
  });

  it("ends the turn once this turn's own deadline has passed", async () => {
    const lobby = lobbyAt(Date.now() + 1_000);
    await act(async () =>
      root.render(
        <TurnClock
          code={code}
          lobby={lobby}
          match={hostMatch()}
          eventBus={eventBus}
          user={user}
        />
      )
    );
    await act(async () => vi.advanceTimersByTime(2_000));
    expect(hoisted.endTurnMock).toHaveBeenCalledTimes(1);
  });

  it("warns in the strip for the last 15 seconds and says Time up on expiry", async () => {
    const slot = document.createElement("div");
    slot.id = "match-strip-clock";
    container.appendChild(slot);
    const announcements: string[] = [];
    eventBus.on(GameEventNames.UI_Announce, (data) =>
      announcements.push(data.headline)
    );
    // Ending the turn is a command both engines run; each says TurnEnded
    hoisted.endTurnMock.mockImplementationOnce(() =>
      eventBus.emit(GameEventNames.TurnEnded, { teamId: "host-team" })
    );
    const clockRoot = document.createElement("div");
    container.appendChild(clockRoot);
    const clock = createRoot(clockRoot);
    await act(async () =>
      clock.render(
        <TurnClock
          code={code}
          lobby={lobbyAt(Date.now() + 16_000)}
          match={hostMatch()}
          eventBus={eventBus}
          user={user}
        />
      )
    );
    await act(async () => vi.advanceTimersByTime(1_000));
    expect(
      slot.querySelector('[data-testid="turn-clock-warning"]')?.textContent
    ).toBe("15 seconds left");
    await act(async () => vi.advanceTimersByTime(16_000));
    expect(announcements).toContain("Time up");
    expect(hoisted.endTurnMock).toHaveBeenCalledTimes(1);
    await act(async () => clock.unmount());
  });

  describe("Time up on the waiting coach's screen", () => {
    const guestMatch = () =>
      ({
        role: "guest",
        myTeamId: "guest-team",
        opponentName: "Host",
        coachName: () => "Host",
        pendingDecision: () => null,
        decidingTeamId: () => null,
        setClockPaused: vi.fn(),
      }) as unknown as OnlineMatch;
    const watch = async (deadline: number) => {
      const announcements: string[] = [];
      eventBus.on(GameEventNames.UI_Announce, (data) =>
        announcements.push(data.headline)
      );
      await act(async () =>
        root.render(
          <TurnClock
            code={code}
            lobby={lobbyAt(deadline)}
            match={guestMatch()}
            eventBus={eventBus}
            user={{ uid: "guest-uid" } as AuthUser}
          />
        )
      );
      return announcements;
    };

    it("says Time up when the other coach's turn ends on the clock", async () => {
      const announcements = await watch(Date.now() + 1_000);
      await act(async () => vi.advanceTimersByTime(1_500));
      expect(announcements).toEqual([]);
      await act(async () =>
        eventBus.emit(GameEventNames.TurnEnded, { teamId: "host-team" })
      );
      expect(announcements).toEqual(["Time up"]);
      expect(hoisted.endTurnMock).not.toHaveBeenCalled();
    });

    it("says nothing when the other coach ends their turn with time left", async () => {
      const announcements = await watch(Date.now() + 60_000);
      await act(async () =>
        eventBus.emit(GameEventNames.TurnEnded, { teamId: "host-team" })
      );
      expect(announcements).toEqual([]);
    });

    it("says nothing when a turnover ended the turn after the clock ran out", async () => {
      const announcements = await watch(Date.now() + 1_000);
      await act(async () => {
        eventBus.emit(GameEventNames.Turnover, { teamId: "host-team" });
        vi.advanceTimersByTime(1_500);
        eventBus.emit(GameEventNames.TurnEnded, { teamId: "host-team" });
      });
      expect(announcements).toEqual([]);
    });
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
