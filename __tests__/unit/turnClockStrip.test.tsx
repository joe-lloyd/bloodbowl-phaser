import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * In the match strip the clock has one short line: one countdown, a short
 * timeout button, and a short word when it stops. Round 1 showed
 * "0:15 15s left" and ran "<coach> disconnected: game paused" over the
 * pitch.
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

vi.mock("../../src/services/ServiceContainer", () => ({
  ServiceContainer: {
    isInitialized: () => true,
    getInstance: () => ({
      gameService: {
        getPhase: () => "PLAY",
        getActiveTeamId: () => "host-team",
        getState: () => ({
          turn: { teamId: "host-team", turnNumber: 3, isHalf2: false },
        }),
        endTurn: vi.fn(),
      },
    }),
  },
}));

import { TurnClock } from "../../src/ui/pages/TurnClock";
import { EventBus } from "../../src/services/EventBus";
import { LobbyDoc } from "../../src/firebase/lobby";
import { OnlineMatch } from "../../src/network/OnlineMatch";
import { AuthUser } from "../../src/firebase/auth";

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
      banks: { "host-uid": 300_000 },
    },
  }) as unknown as LobbyDoc;

const match = {
  role: "host",
  myTeamId: "host-team",
  opponentName: "Grimgutz the Unwashed",
  coachName: () => "Grimgutz the Unwashed",
  pendingDecision: () => null,
  decidingTeamId: () => null,
  setClockPaused: vi.fn(),
} as unknown as OnlineMatch;

/**
 * What a coach sees in the strip, one entry per line of the clock, with
 * screen-reader-only text left out.
 */
const visible = (node: Element | null): string[] => {
  const clock = node?.firstElementChild;
  if (!clock) return [];
  return [...clock.children].map((line) => {
    const copy = line.cloneNode(true) as Element;
    copy.querySelectorAll(".sr-only").forEach((hidden) => hidden.remove());
    return (copy.textContent ?? "").trim();
  });
};

describe("turn clock in the match strip", () => {
  let slot: HTMLDivElement;
  let container: HTMLDivElement;
  beforeEach(() => {
    vi.useFakeTimers();
    slot = document.createElement("div");
    slot.id = "match-strip-clock";
    document.body.appendChild(slot);
    container = document.createElement("div");
    document.body.appendChild(container);
  });
  afterEach(() => {
    slot.remove();
    container.remove();
    vi.useRealTimers();
  });

  const render = async (deadline: number, opponentAway = false) => {
    const root = createRoot(container);
    await act(async () =>
      root.render(
        <TurnClock
          code="ABC123"
          lobby={lobbyAt(deadline)}
          match={match}
          eventBus={new EventBus()}
          user={{ uid: "host-uid" } as AuthUser}
          opponentAway={opponentAway}
        />
      )
    );
    return root;
  };

  it("counts down once in the last fifteen seconds, with a short timeout button", async () => {
    const root = await render(Date.now() + 15_000);
    expect(visible(slot)).toEqual(["⏱ 0:15", "⏸ 5:00"]);
    expect(
      slot.querySelector('[data-testid="turn-clock-warning"]')?.textContent
    ).toBe("15 seconds left");
    expect(slot.querySelector("button")?.getAttribute("aria-label")).toBe(
      "Timeout, 5:00 left"
    );
    await act(async () => root.unmount());
  });

  it("says Paused when the other coach drops, and leaves the name to the banner", async () => {
    const root = await render(Date.now() + 94_000, true);
    expect(visible(slot)).toEqual(["⏸ 1:34", "Paused"]);
    await act(async () => root.unmount());
  });
});
