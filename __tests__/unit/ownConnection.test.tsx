import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type SnapshotListener = (snapshot: {
  metadata: { fromCache: boolean; hasPendingWrites: boolean };
  exists: () => boolean;
  data: () => unknown;
}) => void;
let snapshotListener: SnapshotListener | null = null;

vi.mock("firebase/firestore", async (importOriginal) => ({
  Timestamp: (await importOriginal<typeof import("firebase/firestore")>()).Timestamp,
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
  OPPONENT_ABANDON_MS,
  subscribeMatchLobby,
} from "../../src/firebase/lobby";
import { computeMatchOptionsMenu } from "../../src/ui/components/hud/computeMatchOptionsMenu";
import { ConnectionBanner } from "../../src/ui/pages/ConnectionBanner";
import { lobbyDoc, lobbyPlayer } from "../fixtures/lobby";

const NOW = 1_000_000;
const lobby = lobbyDoc([
  lobbyPlayer("me", NOW),
  lobbyPlayer("opponent", NOW - OPPONENT_ABANDON_MS - 1),
]);

describe("this coach's own connection comes first", () => {
  it("reads as offline, not as the other coach leaving", () => {
    expect(describeConnection({ lobby,opponentUid: "opponent",link: "offline",now: NOW })).toBe(
      "offline"
    );
    expect(describeConnection({ lobby,opponentUid: "opponent",link: "online",now: NOW })).toBe(
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
    document.body.append(container);
    const root: Root = createRoot(container);
    await act(async () => {
      root.render(
        <ConnectionBanner opponentName="Coach-KWAZ" connection="offline" />
      );
    });
    expect(
      container.querySelector('[data-testid="connection-banner"]')?.textContent
    ).toBe(
      "⚠ You are offline, reconnecting…Your moves send once you are back."
    );
    expect(container.textContent).not.toContain("disconnected");
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });
});

describe("subscribeMatchLobby's own link", () => {
  let seen: boolean[];
  let stop: () => void;
  beforeEach(() => {
    seen = [];
    stop = subscribeMatchLobby(
      {
        code: "ABCD",uid: "me",onLobby: () => {},onLink: (link) => {
          const online=link.state!=="offline";
          if(seen.at(-1)!==online) seen.push(online);
        }
      }    );
  });
  afterEach(() => {
    stop();
  });

  it("follows the browser going offline and back", () => {
    dispatchEvent(new Event("offline"));
    dispatchEvent(new Event("online"));
    expect(seen).toEqual([true, false, true]);
  });

  it("counts a lost server link as offline once the server has been reached", () => {
    const snapshot = (fromCache: boolean) => ({
      metadata: { fromCache, hasPendingWrites: false },
      exists: () => true,
      data: () => lobbyDoc([]),
    });
    snapshotListener?.(snapshot(true));
    snapshotListener?.(snapshot(false));
    snapshotListener?.(snapshot(true));
    snapshotListener?.(snapshot(false));
    expect(seen).toEqual([true, false, true]);
  });
});
