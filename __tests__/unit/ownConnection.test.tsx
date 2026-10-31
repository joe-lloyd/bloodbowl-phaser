/**
 * When this coach's own connection drops, the other coach's heartbeat stops
 * arriving too, so it looks as if the other coach left. The page must check
 * its own connection first: the offline coach reads "You are offline,
 * reconnecting", and is never offered to end the match for the other coach.
 */
import { act } from "react";
import { createRoot, Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type SnapshotListener = (snapshot: {
  metadata: { fromCache: boolean; hasPendingWrites: boolean };
  exists: () => boolean;
  data: () => unknown;
}) => void;
let snapshotListener: SnapshotListener | null = null;

vi.mock("firebase/firestore", () => ({
  collection: vi.fn(),
  deleteDoc: vi.fn(),
  doc: vi.fn((_db: unknown, ...path: string[]) => ({ path: path.join("/") })),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  onSnapshot: vi.fn(
    (_ref: unknown, _options: unknown, listener: SnapshotListener) => {
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
  OPPONENT_ABANDON_MS,
  subscribeMatchLobby,
} from "../../src/firebase/lobby";
import { computeMatchOptionsMenu } from "../../src/ui/components/hud/computeMatchOptionsMenu";
import { ConnectionBanner } from "../../src/ui/pages/ConnectionBanner";

const NOW = 1_000_000;
const lobby = {
  players: {
    me: { uid: "me", lastSeen: NOW },
    opponent: { uid: "opponent", lastSeen: NOW - OPPONENT_ABANDON_MS - 1 },
  },
} as unknown as LobbyDoc;

describe("this coach's own connection comes first", () => {
  it("reads as offline, not as the other coach leaving", () => {
    expect(describeConnection(lobby, "opponent", "offline", NOW)).toBe(
      "offline"
    );
    expect(describeConnection(lobby, "opponent", "online", NOW)).toBe(
      "abandonable"
    );
  });

  it("offers the offline coach no way to end the match for the other coach", () => {
    const entries = computeMatchOptionsMenu({
      kind: "online",
      role: "guest",
      opponentName: "Coach-KWAZ",
      connection: "offline",
      endRequest: "none",
    });
    const ids = entries.map((entry) => entry.id);
    expect(ids).not.toContain("force-abandon");
    expect(ids).not.toContain("request-end-match");
    const status = entries.find((entry) => entry.id === "connection-status");
    expect(status && "label" in status ? status.label : null).toBe(
      "You are offline, reconnecting…"
    );
  });

  it("tells the offline coach they are offline", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root: Root = createRoot(container);
    await act(async () =>
      root.render(
        <ConnectionBanner opponentName="Coach-KWAZ" connection="offline" />
      )
    );
    expect(
      container.querySelector('[data-testid="connection-banner"]')?.textContent
    ).toBe("⚠ You are offline, reconnecting…Your moves send once you are back.");
    expect(container.textContent).not.toContain("disconnected");
    await act(async () => root.unmount());
    container.remove();
  });
});

describe("subscribeMatchLobby's own link", () => {
  let seen: boolean[];
  let stop: () => void;
  beforeEach(() => {
    seen = [];
    stop = subscribeMatchLobby(
      "ABCD",
      "me",
      () => {},
      (link) => {
        const online = link.state !== "offline";
        if (seen.at(-1) !== online) seen.push(online);
      }
    );
  });
  afterEach(() => stop());

  it("follows the browser going offline and back", () => {
    window.dispatchEvent(new Event("offline"));
    window.dispatchEvent(new Event("online"));
    expect(seen).toEqual([true, false, true]);
  });

  it("counts a lost server link as offline once the server has been reached", () => {
    const snapshot = (fromCache: boolean) => ({
      metadata: { fromCache, hasPendingWrites: false },
      exists: () => true,
      data: () => ({ players: {} }),
    });
    snapshotListener?.(snapshot(true));
    snapshotListener?.(snapshot(false));
    snapshotListener?.(snapshot(true));
    snapshotListener?.(snapshot(false));
    expect(seen).toEqual([true, false, true]);
  });
});
