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
        getTeam: () => undefined,
        endTurn: hoisted.endTurnMock,
      },
    }),
  },
}));

import { TurnClock } from "../../src/ui/pages/TurnClock";
import { EventBus } from "../../src/services/EventBus";
import { GameEventNames } from "../../src/types/events";
import { LobbyDoc, OwnLink, playHold } from "../../src/firebase/lobby";
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

  it("lets the waiting coach write the resumed deadline when the active coach was away", async () => {
    // The active host may reload while away and lose its own freeze, so the
    // guest, who saw the absence, writes the time that was left
    const match = {
      role: "guest",
      myTeamId: "guest-team",
      opponentName: "Host",
      coachName: () => "Host",
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
          user={{ uid: "guest-uid" } as AuthUser}
          opponentAway={opponentAway}
        />
      );

    await act(async () => render(true));
    await act(async () => vi.advanceTimersByTime(30_000));
    hoisted.setTurnDeadlineMock.mockClear();
    await act(async () => render(false));
    expect(hoisted.setTurnDeadlineMock).toHaveBeenCalledTimes(1);
    const [, deadline] = hoisted.setTurnDeadlineMock.mock.calls[0] as unknown as [
      string,
      number,
    ];
    expect(deadline - Date.now()).toBeGreaterThan(59_000);
    expect(deadline - Date.now()).toBeLessThanOrEqual(60_000);
  });

  it("shows the time left after a pause until the resumed deadline arrives", async () => {
    // Round 2, 25:47: back from a pause, the clock flashed a stale value
    // read from the deadline set before the pause
    const match = {
      role: "host",
      myTeamId: "host-team",
      opponentName: "Guest",
      coachName: () => "Guest",
      pendingDecision: () => null,
      decidingTeamId: () => null,
      setClockPaused: vi.fn(),
    } as unknown as OnlineMatch;
    const before = lobbyAt(Date.now() + 60_000);
    const render = (lobby: LobbyDoc, opponentAway: boolean) =>
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
    await act(async () => render(before, true));
    await act(async () => vi.advanceTimersByTime(35_000));
    await act(async () => render(before, false));
    await act(async () => vi.advanceTimersByTime(1_000));
    const clock = () =>
      container.querySelector('[data-testid="turn-clock"]')?.textContent ?? "";
    expect(clock()).toContain("⏱ 0:59");
    expect(hoisted.endTurnMock).not.toHaveBeenCalled();
    // The resumed deadline arrives: the clock follows it
    await act(async () => render(lobbyAt(Date.now() + 58_000), false));
    expect(clock()).toContain("⏱ 0:58");
  });

  it("pauses both clocks from the last heartbeat both coaches saw, so neither loses time", async () => {
    // Round 3, 34:49: the guest dropped and paused at 3:44; the host saw it
    // 13 s later and paused at 3:32. On resume the guest lost 12 s.
    const lobby: LobbyDoc = {
      ...lobbyAt(Date.now() + 224_000),
      settings: { turnSeconds: 240, timeoutBankMs: 0 },
    } as unknown as LobbyDoc;
    // The guest's last heartbeat the server holds, a second before it dropped
    const awaySince = Date.now() - 1_000;
    const guestMatch = {
      ...hostMatch(),
      role: "guest",
      myTeamId: "guest-team",
    } as unknown as OnlineMatch;
    const guestRoot = document.createElement("div");
    document.body.appendChild(guestRoot);
    const guestClock = createRoot(guestRoot);
    const hostMatchNow = hostMatch();
    const show = (away: boolean) => {
      root.render(
        <TurnClock
          code={code}
          lobby={lobby}
          match={hostMatchNow}
          eventBus={eventBus}
          user={user}
          opponentAway={away}
          awaySince={away ? awaySince : null}
        />
      );
      guestClock.render(
        <TurnClock
          code={code}
          lobby={lobby}
          match={guestMatch}
          eventBus={eventBus}
          user={{ uid: "guest-uid" } as AuthUser}
          opponentAway={guestAway}
          awaySince={guestAway ? awaySince : null}
          offline={guestAway}
        />
      );
    };
    let guestAway = false;
    await act(async () => show(false));
    // The guest knows at once; the host after its heartbeat grace
    guestAway = true;
    await act(async () => show(false));
    await act(async () => vi.advanceTimersByTime(13_000));
    await act(async () => show(true));
    await act(async () => vi.advanceTimersByTime(500));
    const stopped = () =>
      [
        ...document.querySelectorAll('[data-testid="turn-clock-stopped"]'),
      ].map((clock) => clock.textContent?.match(/\d+:\d\d/)?.[0]);
    expect(stopped()).toEqual(["3:45", "3:45"]);

    await act(async () => vi.advanceTimersByTime(20_000));
    hoisted.setTurnDeadlineMock.mockClear();
    guestAway = false;
    await act(async () => show(false));
    // Only the coach who stayed online writes the resumed deadline
    expect(hoisted.setTurnDeadlineMock).toHaveBeenCalledTimes(1);
    const [, deadline] = hoisted.setTurnDeadlineMock.mock.calls[0] as unknown as [
      string,
      number,
    ];
    expect(deadline - Date.now()).toBe(225_000);
    await act(async () => guestClock.unmount());
    guestRoot.remove();
  });

  describe("a drop, as both coaches see it", () => {
    /** The guest drops at T0 and comes back after `cut` ms. */
    async function playCut(cut: number, seconds: number) {
      const start = Date.now();
      const deadline = start + 74_000;
      const hostClock = hostMatch();
      const guestMatch = {
        ...hostMatch(),
        role: "guest",
        myTeamId: "guest-team",
        opponentName: "Host",
      } as unknown as OnlineMatch;
      const guestDiv = document.createElement("div");
      document.body.appendChild(guestDiv);
      const guestRoot = createRoot(guestDiv);
      // Heartbeats every 6 s; the guest's stop reaching the server while
      // it is cut off
      const lastBeat = (at: number, cutOff: boolean) => {
        const beat = start + Math.floor((at - start) / 6_000) * 6_000;
        return cutOff ? start : beat;
      };
      const frames: { host: string; guest: string }[] = [];
      const show = () => {
        const now = Date.now();
        const cutOff = now - start < cut;
        const lobby = {
          ...lobbyAt(deadline),
          players: {
            "host-uid": { lastSeen: lastBeat(now, false) },
            "guest-uid": { lastSeen: lastBeat(now, cutOff) },
          },
        } as unknown as LobbyDoc;
        const props = (opponentUid: string, link: OwnLink) => {
          const hold = playHold(lobby, opponentUid, link, now);
          return {
            opponentAway: hold != null,
            awaySince: hold?.since ?? null,
            offline: link.state === "offline",
          };
        };
        root.render(
          <TurnClock
            code={code}
            lobby={lobby}
            match={hostClock}
            eventBus={eventBus}
            user={user}
            {...props("guest-uid", {
              state: "online",
              confirmedSeen: lastBeat(now, false),
            })}
          />
        );
        guestRoot.render(
          <TurnClock
            code={code}
            lobby={lobby}
            match={guestMatch}
            eventBus={eventBus}
            user={{ uid: "guest-uid" } as AuthUser}
            {...props("host-uid", {
              state: cutOff ? "offline" : "online",
              confirmedSeen: lastBeat(now, cutOff),
            })}
          />
        );
      };
      // The time on the clock, running or stopped
      const read = (div: HTMLElement) =>
        div
          .querySelector('[data-testid^="turn-clock"]')
          ?.textContent?.match(/[⏱⏸] \d:\d\d/)?.[0] ?? "";
      for (let s = 0; s < seconds; s++) {
        await act(async () => show());
        frames.push({ host: read(container), guest: read(guestDiv) });
        await act(async () => vi.advanceTimersByTime(1_000));
      }
      await act(async () => guestRoot.unmount());
      guestDiv.remove();
      return frames;
    }

    it("keeps both clocks running through a cut the host reads as slow", async () => {
      // Round 4, 5:25: the guest paused at 1:14 for an 11 s cut, but the
      // host only saw a slow link and kept counting. Back online, the
      // guest jumped from 1:09 to 0:52.
      const frames = await playCut(11_000, 20);
      expect(frames.filter((f) => f.host !== f.guest)).toEqual([]);
      expect(frames.map((f) => f.guest)).toEqual(
        Array.from({ length: 20 }, (_, s) => {
          const left = 74 - s;
          return `⏱ ${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
        })
      );
      expect(hoisted.setTurnDeadlineMock).not.toHaveBeenCalled();
    });

    it("stops both clocks at the same time once the cut reads as a disconnect", async () => {
      const frames = await playCut(30_000, 32);
      expect(frames.filter((f) => f.host !== f.guest)).toEqual([]);
      // Both stop at the guest's last heartbeat, with 1:14 left
      expect(frames[25].guest).toBe("⏸ 1:14");
      // Only the host, who stayed online, writes the resumed deadline
      expect(hoisted.setTurnDeadlineMock).toHaveBeenCalledTimes(1);
    });
  });

  it("never shows more than the turn's length at a turn start", async () => {
    // Round 2: some turns started at 4:01, the writer's clock a little ahead
    await act(async () =>
      root.render(
        <TurnClock
          code={code}
          lobby={lobbyAt(Date.now() + 120_700)}
          match={hostMatch()}
          eventBus={eventBus}
          user={user}
        />
      )
    );
    expect(
      container.querySelector('[data-testid="turn-clock"]')?.textContent
    ).toContain("⏱ 2:00");
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
