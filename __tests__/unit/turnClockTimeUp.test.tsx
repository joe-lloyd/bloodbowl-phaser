import { fixtureValue } from "../../src/testing/fixtureValue";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

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

const state = { turn: { teamId: "host-team", turnNumber: 3, isHalf2: false } };
vi.mock("../../src/services/ServiceContainer", () => ({
  ServiceContainer: {
    isInitialized: () => true,
    getInstance: () => ({
      gameService: {
        getPhase: () => "PLAY",
        getActiveTeamId: () => state.turn.teamId,
        getState: () => state,
        getTeam: (id: string) =>
          ({ "host-team": { name: "Reikland Reavers" } })[id],
        endTurn: vi.fn(),
      },
    }),
  },
}));

import { TurnClock } from "../../src/ui/pages/TurnClock";
import { EventBus } from "../../src/services/EventBus";
import { GameEventNames, type MatchMoment } from "../../src/types/events";
import { type LobbyDoc } from "../../src/firebase/lobby";
import { type OnlineMatch } from "../../src/network/OnlineMatch";
import { type AuthUser } from "../../src/firebase/auth";
import { MomentQueue } from "../../src/game/presentation/momentQueue";

const lobbyAt = (deadline: number): LobbyDoc =>
  ({
    code: "ABC123",
    hostUid: "host-uid",
    guestUid: "guest-uid",
    status: "active",
    settings: { turnSeconds: 120, timeoutBankMs: 0, progressionEnabled: false },
    players: {},
    createdAt: null,
    timer: {
      deadline,
      turn: "host-team:1:3",
      pausedBy: null,
      pausedAt: null,
      banks: {},
    },
  }) as unknown as LobbyDoc;

const coach = (myTeamId: string) =>
  ({
    role: myTeamId === "host-team" ? "host" : "guest",
    myTeamId,
    opponentName: "Other",
    coachName: () => "Other",
    pendingDecision: () => null,
    decidingTeamId: () => null,
    setClockPaused: vi.fn(),
  }) as unknown as OnlineMatch;

describe("Time up when a turn runs out", () => {
  afterEach(() => {
    vi.useRealTimers();
    state.turn = { teamId: "host-team", turnNumber: 3, isHalf2: false };
  });

  for (const [screen, myTeamId] of [
    ["acting", "host-team"],
    ["waiting", "guest-team"],
  ] as const) {
    it(`shows on the ${screen} coach's screen before the next turn banner`, async () => {
      vi.useFakeTimers();
      const eventBus = new EventBus();
      const queue = new MomentQueue(eventBus);
      const shown: { text: string; subtitle?: string | undefined; at: number }[] = [];
      eventBus.on(
        GameEventNames.UI_PresentMoment,
        (moment: MatchMoment | null) => {
          shown.push({
            text: moment && "headline" in moment ? moment.headline : "",
            subtitle:
              moment && "subtitle" in moment ? moment.subtitle : undefined,
            at: Date.now(),
          });
        }
      );
      const container = document.createElement("div");
      document.body.append(container);
      const root = createRoot(container);
      await act(async () => {
        root.render(
          <TurnClock
            code="ABC123"
            lobby={lobbyAt(Date.now() - 200)}
            match={coach(myTeamId)}
            eventBus={eventBus}
            user={{ uid: `${myTeamId}-uid` } as AuthUser}
          />
        );
      });

      await act(async () => {
        eventBus.emit(GameEventNames.TurnEnded, { teamId: "host-team" });
        state.turn = { teamId: "guest-team", turnNumber: 3, isHalf2: false };
        eventBus.emit(GameEventNames.UI_Announce, {
          kind: "turn-started",
          headline: "Guest Team's Turn",
        });
      });
      await act(async () => vi.advanceTimersByTimeAsync(10_000));

      const banners = shown.filter((s) => s.text !== "");
      expect(banners.map((b) => b.text)).toEqual([
        "Time up",
        "Guest Team's Turn",
      ]);
      expect(fixtureValue(banners[1]).at - fixtureValue(banners[0]).at).toBeGreaterThanOrEqual(2000);

      expect(fixtureValue(banners[0]).subtitle).toBe("Reikland Reavers' turn ended");

      queue.dispose();
      await act(async () => {
        root.unmount();
      });
      container.remove();
    });
  }
});
