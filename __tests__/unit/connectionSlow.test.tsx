/**
 * Round 3, 53:32: three messages took 12 to 16 s, with no forced cut. Each
 * screen then said the other coach had disconnected, both clocks paused,
 * and the guest, on the move, lost End Turn. A slow link now reads as
 * slow, play goes on, and only a longer silence counts as a disconnect.
 */
import { act } from "react";
import { createRoot, Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Snapshot = {
  metadata: { fromCache: boolean; hasPendingWrites: boolean };
  exists: () => boolean;
  data: () => unknown;
};
let snapshotListener: ((snapshot: Snapshot) => void) | null = null;
const listens = vi.hoisted(() => ({ count: 0 }));

vi.mock("firebase/firestore", () => ({
  collection: vi.fn(),
  deleteDoc: vi.fn(),
  doc: vi.fn((_db: unknown, ...path: string[]) => ({ path: path.join("/") })),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  onSnapshot: vi.fn(
    (_ref: unknown, _options: unknown, listener: (s: Snapshot) => void) => {
      listens.count++;
      snapshotListener = listener;
      return () => {
        snapshotListener = null;
      };
    }
  ),
  runTransaction: vi.fn(),
  serverTimestamp: vi.fn(),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  writeBatch: vi.fn(),
}));
vi.mock("../../src/firebase/config", () => ({ getDb: vi.fn(() => ({})) }));

import {
  describeConnection,
  LobbyDoc,
  OwnLink,
  playHold,
  subscribeMatchLobby,
} from "../../src/firebase/lobby";
import { ConnectionBanner } from "../../src/ui/pages/ConnectionBanner";

const NOW = 1_000_000;
const lobbyWith = (opponentSeenAgo: number) =>
  ({
    players: {
      me: { uid: "me", lastSeen: NOW },
      opponent: { uid: "opponent", lastSeen: NOW - opponentSeenAgo },
    },
  }) as unknown as LobbyDoc;

describe("a slow link is not a disconnect", () => {
  it("reads a 16 s silence from the other coach as slow, not gone", () => {
    expect(describeConnection(lobbyWith(16_000), "opponent", "online", NOW)).toBe(
      "slow"
    );
    expect(describeConnection(lobbyWith(5_000), "opponent", "online", NOW)).toBe(
      "online"
    );
    expect(describeConnection(lobbyWith(25_000), "opponent", "online", NOW)).toBe(
      "reconnecting"
    );
  });

  it("reads this coach's own slow link as slow, whatever the other coach's heartbeat says", () => {
    expect(describeConnection(lobbyWith(25_000), "opponent", "slow", NOW)).toBe(
      "slow"
    );
    expect(describeConnection(lobbyWith(25_000), "opponent", "offline", NOW)).toBe(
      "offline"
    );
  });

  it("holds play from the absent coach's last heartbeat, on both screens", () => {
    const online: OwnLink = { state: "online", confirmedSeen: NOW };
    // The other coach: a 16 s silence is slow, a 25 s one holds play
    expect(playHold(lobbyWith(16_000), "opponent", online, NOW)).toBeNull();
    expect(playHold(lobbyWith(25_000), "opponent", online, NOW)).toEqual({
      since: NOW - 25_000,
    });
    // This coach, cut off: the same rule on its own last heartbeat, and
    // the other coach's stale heartbeat says nothing
    const cut = (ago: number, state: OwnLink["state"]): OwnLink => ({
      state,
      confirmedSeen: NOW - ago,
    });
    expect(
      playHold(lobbyWith(16_000), "opponent", cut(11_000, "offline"), NOW)
    ).toBeNull();
    expect(
      playHold(lobbyWith(40_000), "opponent", cut(25_000, "offline"), NOW)
    ).toEqual({ since: NOW - 25_000 });
    expect(
      playHold(lobbyWith(40_000), "opponent", cut(25_000, "slow"), NOW)
    ).toEqual({ since: NOW - 25_000 });
  });

  it("says the connection is slow", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root: Root = createRoot(container);
    await act(async () =>
      root.render(
        <ConnectionBanner opponentName="Coach-CAAG" connection="slow" />
      )
    );
    expect(
      container.querySelector('[data-testid="connection-banner"]')?.textContent
    ).toBe("⚠ Connection slowMoves may take a few seconds to arrive.");
    expect(container.textContent).not.toContain("disconnected");
    await act(async () => root.unmount());
    container.remove();
  });
});

describe("subscribeMatchLobby", () => {
  let lobbies: (LobbyDoc | null)[];
  let links: OwnLink[];
  let stop: () => void;
  const doc = (lastSeen: number) => ({
    players: { me: { uid: "me", lastSeen } },
  });
  const snap = (
    fromCache: boolean,
    hasPendingWrites: boolean,
    lastSeen = 500
  ): Snapshot => ({
    metadata: { fromCache, hasPendingWrites },
    exists: () => true,
    data: () => doc(lastSeen),
  });

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    listens.count = 0;
    lobbies = [];
    links = [];
    stop = subscribeMatchLobby(
      "ABCD",
      "me",
      (lobby) => lobbies.push(lobby),
      (link) => links.push(link)
    );
  });
  afterEach(() => {
    stop();
    vi.useRealTimers();
  });

  it("reads the lobby and this coach's link from one listener", () => {
    snapshotListener?.(snap(false, false, 900));
    expect(listens.count).toBe(1);
    expect(lobbies).toEqual([doc(900)]);
    expect(links.at(-1)).toEqual({ state: "online", confirmedSeen: 900 });
  });

  it("calls the link slow while its writes wait over 6 s for the server", async () => {
    snapshotListener?.(snap(false, false, 900));
    snapshotListener?.(snap(false, true, 7_000));
    await vi.advanceTimersByTimeAsync(5_000);
    expect(links.at(-1)?.state).toBe("online");
    await vi.advanceTimersByTimeAsync(2_000);
    expect(links.at(-1)).toEqual({ state: "slow", confirmedSeen: 900 });
    snapshotListener?.(snap(false, false, 7_000));
    expect(links.at(-1)).toEqual({ state: "online", confirmedSeen: 7_000 });
  });

  it("follows the browser going offline and back", () => {
    window.dispatchEvent(new Event("offline"));
    window.dispatchEvent(new Event("online"));
    expect(links.map((link) => link.state)).toEqual([
      "online",
      "offline",
      "online",
    ]);
  });
});
