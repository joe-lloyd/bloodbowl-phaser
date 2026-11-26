import { fixtureValue } from "../../src/testing/fixtureValue";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

vi.mock("../../src/services/ServiceContainer", () => ({
  ServiceContainer: {
    isInitialized: () => true,
    getInstance: () => ({
      gameService: {
        getPhase: () => "PLAY",

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
import {
  type LobbyDoc,
  type OwnLink,
  playHold,
} from "../../src/firebase/lobby";
import { type OnlineMatch } from "../../src/network/OnlineMatch";
import { type AuthUser } from "../../src/firebase/auth";

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

  const renderClock = (
    lobby: LobbyDoc,
    match: OnlineMatch,
    opponentAway: boolean
  ) => {
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
  };

  beforeEach(() => {
    vi.useFakeTimers();
    hoisted.setTurnDeadlineMock.mockClear();
    hoisted.endTurnMock.mockClear();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    eventBus = new EventBus();
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
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
    const render = (opponentAway: boolean) => {
      renderClock(lobby, match, opponentAway);
    };

    await act(async () => {
      render(true);
    });
    await act(async () => vi.advanceTimersByTime(5 * 60 * 1000));
    expect(container.textContent).toContain("disconnected");
    expect(hoisted.endTurnMock).not.toHaveBeenCalled();
    expect(match.setClockPaused).toHaveBeenLastCalledWith("opponent-away");

    await act(async () => {
      render(false);
    });
    const [, deadline] = hoisted.setTurnDeadlineMock.mock.calls.at(
      -1
    ) as unknown as [string, number];

    expect(deadline - Date.now()).toBeGreaterThan(59_000);
    expect(deadline - Date.now()).toBeLessThanOrEqual(60_000);
  });

  it("lets the waiting coach write the resumed deadline when the active coach was away", async () => {
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
    const render = (opponentAway: boolean) => {
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
    };

    await act(async () => {
      render(true);
    });
    await act(async () => vi.advanceTimersByTime(30_000));
    hoisted.setTurnDeadlineMock.mockClear();
    await act(async () => {
      render(false);
    });
    expect(hoisted.setTurnDeadlineMock).toHaveBeenCalledTimes(1);
    const [, deadline] = hoisted.setTurnDeadlineMock.mock
      .calls[0] as unknown as [string, number];
    expect(deadline - Date.now()).toBeGreaterThan(59_000);
    expect(deadline - Date.now()).toBeLessThanOrEqual(60_000);
  });

  it("shows the time left after a pause until the resumed deadline arrives", async () => {
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
    const render = (lobby: LobbyDoc, opponentAway: boolean) => {
      renderClock(lobby, match, opponentAway);
    };
    await act(async () => {
      render(before, true);
    });
    await act(async () => vi.advanceTimersByTime(35_000));
    await act(async () => {
      render(before, false);
    });
    await act(async () => vi.advanceTimersByTime(1000));
    const clock = () =>
      container.querySelector('[data-testid="turn-clock"]')?.textContent ?? "";
    expect(clock()).toContain("⏱ 0:59");
    expect(hoisted.endTurnMock).not.toHaveBeenCalled();

    await act(async () => {
      render(lobbyAt(Date.now() + 58_000), false);
    });
    expect(clock()).toContain("⏱ 0:58");
  });

  it("pauses both clocks from the last heartbeat both coaches saw, so neither loses time", async () => {
    const lobby: LobbyDoc = {
      ...lobbyAt(Date.now() + 224_000),
      settings: { turnSeconds: 240, timeoutBankMs: 0 },
    } as unknown as LobbyDoc;

    const awaySince = Date.now() - 1000;
    const guestMatch = {
      ...hostMatch(),
      role: "guest",
      myTeamId: "guest-team",
    } as unknown as OnlineMatch;
    const guestRoot = document.createElement("div");
    document.body.append(guestRoot);
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
          awayIsMe={guestAway}
          offline={guestAway}
        />
      );
    };
    let guestAway = false;
    await act(async () => {
      show(false);
    });

    guestAway = true;
    await act(async () => {
      show(false);
    });
    await act(async () => vi.advanceTimersByTime(13_000));
    await act(async () => {
      show(true);
    });
    await act(async () => vi.advanceTimersByTime(500));
    const stopped = () =>
      [...document.querySelectorAll('[data-testid="turn-clock-stopped"]')].map(
        (clock) => /\d+:\d\d/.exec(clock.textContent)?.[0]
      );
    expect(stopped()).toEqual(["3:45", "3:45"]);

    await act(async () => vi.advanceTimersByTime(20_000));
    hoisted.setTurnDeadlineMock.mockClear();
    guestAway = false;
    await act(async () => {
      show(false);
    });

    expect(hoisted.setTurnDeadlineMock).toHaveBeenCalledTimes(1);
    const [, deadline] = hoisted.setTurnDeadlineMock.mock
      .calls[0] as unknown as [string, number];
    expect(deadline - Date.now()).toBe(225_000);
    await act(async () => {
      guestClock.unmount();
    });
    guestRoot.remove();
  });

  describe("a drop, as both coaches see it", () => {
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
      document.body.append(guestDiv);
      const guestRoot = createRoot(guestDiv);

      const lastBeat = (at: number, cutOff: boolean) => {
        const beat = start + Math.floor((at - start) / 6000) * 6000;
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
          const hold = playHold({ lobby: lobby, opponentUid: opponentUid, link: link, now: now });
          return {
            opponentAway: hold != null,
            awaySince: hold?.since ?? null,
            awayIsMe: hold?.absent === "me",
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

      const read = (div: HTMLElement) =>
        div
          .querySelector('[data-testid^="turn-clock"]')
          ?.textContent?.match(/[⏱⏸] \d:\d\d/)?.[0] ?? "";
      for (let s = 0; s < seconds; s++) {
        await act(async () => {
          show();
        });
        frames.push({ host: read(container), guest: read(guestDiv) });
        await act(async () => vi.advanceTimersByTime(1000));
      }
      await act(async () => {
        guestRoot.unmount();
      });
      guestDiv.remove();
      return frames;
    }

    it("keeps both clocks running through a cut the host reads as slow", async () => {
      const frames = await playCut(11_000, 20);
      expect(frames.filter((f) => f.host !== f.guest)).toEqual([]);
      expect(frames.map((f) => f.guest)).toEqual(
        Array.from({ length: 20 }, (_, s) => {
          const left = 74 - s;
          return `⏱ ${String(Math.floor(left / 60))}:${String(left % 60).padStart(2, "0")}`;
        })
      );
      expect(hoisted.setTurnDeadlineMock).not.toHaveBeenCalled();
    });

    it("stops both clocks at the same time once the cut reads as a disconnect", async () => {
      const frames = await playCut(30_000, 32);
      expect(frames.filter((f) => f.host !== f.guest)).toEqual([]);

      expect(fixtureValue(frames[25]).guest).toBe("⏸ 1:14");

      expect(hoisted.setTurnDeadlineMock).toHaveBeenCalledTimes(1);
    });
  });

  it("stays stopped, and writes nothing, if this coach drops while the other is away", async () => {
    const lobby = lobbyAt(Date.now() + 60_000);
    const match = hostMatch();
    const render = (opponentAway: boolean, offline: boolean) => {
      root.render(
        <TurnClock
          code={code}
          lobby={lobby}
          match={match}
          eventBus={eventBus}
          user={user}
          opponentAway={opponentAway}
          awaySince={opponentAway ? Date.now() - 21_000 : null}
          offline={offline}
        />
      );
    };
    await act(async () => {
      render(true, false);
    });
    await act(async () => vi.advanceTimersByTime(5000));
    await act(async () => {
      render(false, true);
    });
    await act(async () => vi.advanceTimersByTime(5000));
    expect(
      container.querySelector('[data-testid="turn-clock-stopped"]')
    ).not.toBeNull();
    expect(hoisted.setTurnDeadlineMock).not.toHaveBeenCalled();

    await act(async () => {
      render(false, false);
    });
    expect(hoisted.setTurnDeadlineMock).toHaveBeenCalledTimes(1);
  });

  it("does not end its own turn on the clock while it is offline", async () => {
    const lobby = lobbyAt(Date.now() + 3000);
    const render = (offline: boolean) => {
      root.render(
        <TurnClock
          code={code}
          lobby={lobby}
          match={hostMatch()}
          eventBus={eventBus}
          user={user}
          offline={offline}
        />
      );
    };
    await act(async () => {
      render(true);
    });
    await act(async () => vi.advanceTimersByTime(10_000));
    expect(hoisted.endTurnMock).not.toHaveBeenCalled();

    await act(async () => {
      render(false);
    });
    await act(async () => vi.advanceTimersByTime(1000));
    expect(hoisted.endTurnMock).toHaveBeenCalledTimes(1);
  });

  it("leaves the resumed deadline to the other coach when its own slow link held play", async () => {
    const lobby = lobbyAt(Date.now() + 60_000);
    const guestMatch = {
      ...hostMatch(),
      role: "guest",
      myTeamId: "guest-team",
      opponentName: "Host",
    } as unknown as OnlineMatch;
    const render = (held: boolean) => {
      root.render(
        <TurnClock
          code={code}
          lobby={lobby}
          match={guestMatch}
          eventBus={eventBus}
          user={{ uid: "guest-uid" } as AuthUser}
          opponentAway={held}
          awaySince={held ? Date.now() - 21_000 : null}
          awayIsMe={held}
        />
      );
    };
    await act(async () => {
      render(true);
    });
    await act(async () => vi.advanceTimersByTime(500));
    expect(container.textContent).toContain(
      "Your connection dropped: game paused"
    );
    expect(container.textContent).not.toContain("Host disconnected");
    await act(async () => vi.advanceTimersByTime(5000));
    await act(async () => {
      render(false);
    });
    expect(hoisted.setTurnDeadlineMock).not.toHaveBeenCalled();
  });

  it("never shows more than the turn's length at a turn start", async () => {
    await act(async () => {
      root.render(
        <TurnClock
          code={code}
          lobby={lobbyAt(Date.now() + 120_700)}
          match={hostMatch()}
          eventBus={eventBus}
          user={user}
        />
      );
    });
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
    const lobby = lobbyAt(Date.now() - 1000, "guest-team:1:3");
    await act(async () => {
      root.render(
        <TurnClock
          code={code}
          lobby={lobby}
          match={hostMatch()}
          eventBus={eventBus}
          user={user}
        />
      );
    });
    await act(async () => vi.advanceTimersByTime(3000));
    expect(hoisted.endTurnMock).not.toHaveBeenCalled();
    expect(container.textContent).toContain("2:00");
  });

  it("ends the turn once this turn's own deadline has passed", async () => {
    const lobby = lobbyAt(Date.now() + 1000);
    await act(async () => {
      root.render(
        <TurnClock
          code={code}
          lobby={lobby}
          match={hostMatch()}
          eventBus={eventBus}
          user={user}
        />
      );
    });
    await act(async () => vi.advanceTimersByTime(2000));
    expect(hoisted.endTurnMock).toHaveBeenCalledTimes(1);
  });

  it("warns in the strip for the last 15 seconds and says Time up on expiry", async () => {
    const slot = document.createElement("div");
    slot.id = "match-strip-clock";
    container.append(slot);
    const announcements: string[] = [];
    eventBus.on(GameEventNames.UI_Announce, (data) =>
      announcements.push(data.headline)
    );

    hoisted.endTurnMock.mockImplementationOnce(() => {
      eventBus.emit(GameEventNames.TurnEnded, { teamId: "host-team" });
    });
    const clockRoot = document.createElement("div");
    container.append(clockRoot);
    const clock = createRoot(clockRoot);
    await act(async () => {
      clock.render(
        <TurnClock
          code={code}
          lobby={lobbyAt(Date.now() + 16_000)}
          match={hostMatch()}
          eventBus={eventBus}
          user={user}
        />
      );
    });
    await act(async () => vi.advanceTimersByTime(1000));
    expect(
      slot.querySelector('[data-testid="turn-clock-warning"]')?.textContent
    ).toBe("15 seconds left");
    await act(async () => vi.advanceTimersByTime(16_000));
    expect(announcements).toContain("Time up");
    expect(hoisted.endTurnMock).toHaveBeenCalledTimes(1);
    await act(async () => {
      clock.unmount();
    });
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
      await act(async () => {
        root.render(
          <TurnClock
            code={code}
            lobby={lobbyAt(deadline)}
            match={guestMatch()}
            eventBus={eventBus}
            user={{ uid: "guest-uid" } as AuthUser}
          />
        );
      });
      return announcements;
    };

    it("says Time up when the other coach's turn ends on the clock", async () => {
      const announcements = await watch(Date.now() + 1000);
      await act(async () => vi.advanceTimersByTime(1500));
      expect(announcements).toEqual([]);
      await act(async () => {
        eventBus.emit(GameEventNames.TurnEnded, { teamId: "host-team" });
      });
      expect(announcements).toEqual(["Time up"]);
      expect(hoisted.endTurnMock).not.toHaveBeenCalled();
    });

    it("says nothing when the other coach ends their turn with time left", async () => {
      const announcements = await watch(Date.now() + 60_000);
      await act(async () => {
        eventBus.emit(GameEventNames.TurnEnded, { teamId: "host-team" });
      });
      expect(announcements).toEqual([]);
    });

    it("says nothing when a turnover ended the turn after the clock ran out", async () => {
      const announcements = await watch(Date.now() + 1000);
      await act(async () => {
        eventBus.emit(GameEventNames.Turnover, { teamId: "host-team" });
        vi.advanceTimersByTime(1500);
        eventBus.emit(GameEventNames.TurnEnded, { teamId: "host-team" });
      });
      expect(announcements).toEqual([]);
    });
  });

  it("stops while the defender decides and answers for them after ten seconds", async () => {
    const run = vi.fn(() => Promise.resolve({ ok: true }));
    const pending = {
      type: "block-dice",
      attackerId: "a1",
      defenderId: "d1",
      chooserTeamId: "guest-team",
      options: [{ type: "pow" }, { type: "skull" }],
    };

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
    await act(async () => {
      root.render(
        <TurnClock
          code={code}
          lobby={lobby}
          match={match}
          eventBus={eventBus}
          user={{ uid: "guest-uid" } as AuthUser}
        />
      );
    });
    await act(async () => vi.advanceTimersByTime(4000));
    expect(container.textContent).toContain("to decide");
    expect(run).not.toHaveBeenCalled();

    await act(async () => vi.advanceTimersByTime(7000));
    expect(run).toHaveBeenCalledWith({ type: "choose-block-result", index: 0 });
    expect(run).toHaveBeenCalledTimes(1);
  });
});
