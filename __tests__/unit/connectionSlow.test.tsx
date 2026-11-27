import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface Snapshot {
  metadata: { fromCache: boolean; hasPendingWrites: boolean };
  exists: () => boolean;
  data: () => unknown;
}
let snapshotListener: ((snapshot: Snapshot) => void) | null = null;
const listens = vi.hoisted(() => ({ count: 0 }));

vi.mock("firebase/firestore", async (importOriginal) => {
  const actual = await importOriginal<typeof import("firebase/firestore")>();
  return {
  Timestamp: actual.Timestamp,
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
  };
});
vi.mock("../../src/firebase/config", () => ({ getDb: vi.fn(() => ({})) }));

import {
  describeConnection,
  type LobbyDoc,
  type OwnLink,
  heartbeat,
  playHold,
  subscribeMatchLobby,
} from "../../src/firebase/lobby";
import { updateDoc } from "firebase/firestore";
import { ConnectionBanner } from "../../src/ui/pages/ConnectionBanner";
import { lobbyDoc, lobbyPlayer } from "../fixtures/lobby";

const NOW = 1_000_000;
const noop = () => {};
const lobbyWith = (opponentSeenAgo: number) =>
  ({
    players: {
      me: { uid: "me", lastSeen: NOW },
      opponent: { uid: "opponent", lastSeen: NOW - opponentSeenAgo },
    },
  }) as unknown as LobbyDoc;

const doc = (lastSeen: number) => lobbyDoc([lobbyPlayer("me", lastSeen)]);
const snap = (hasPendingWrites: boolean, lastSeen = 500): Snapshot => ({
  metadata: { fromCache: false, hasPendingWrites },
  exists: () => true,
  data: () => doc(lastSeen),
});

describe("a slow link is not a disconnect", () => {
  it("reads a 16 s silence from the other coach as slow, not gone", () => {
    expect(
      describeConnection({ lobby: lobbyWith(16_000),opponentUid: "opponent",link: "online",now: NOW })
    ).toBe("slow");
    expect(
      describeConnection({ lobby: lobbyWith(5000),opponentUid: "opponent",link: "online",now: NOW })
    ).toBe("online");
    expect(
      describeConnection({ lobby: lobbyWith(25_000),opponentUid: "opponent",link: "online",now: NOW })
    ).toBe("reconnecting");
  });

  it("reads this coach's own slow link as slow, whatever the other coach's heartbeat says", () => {
    expect(describeConnection({ lobby: lobbyWith(25_000),opponentUid: "opponent",link: "slow",now: NOW })).toBe(
      "slow"
    );
    expect(
      describeConnection({ lobby: lobbyWith(25_000),opponentUid: "opponent",link: "offline",now: NOW })
    ).toBe("offline");
  });

  it("holds play from the absent coach's last heartbeat, on both screens", () => {
    const online: OwnLink = { state: "online", confirmedSeen: NOW };

    expect(playHold({ lobby: lobbyWith(16_000), opponentUid: "opponent", link: online, now: NOW })).toBeNull();
    expect(playHold({ lobby: lobbyWith(25_000), opponentUid: "opponent", link: online, now: NOW })).toEqual({
      since: NOW - 25_000,
      absent: "opponent",
    });

    const cut = (ago: number, state: OwnLink["state"]): OwnLink => ({
      state,
      confirmedSeen: NOW - ago,
    });
    expect(
      playHold({ lobby: lobbyWith(16_000), opponentUid: "opponent", link: cut(11_000, "offline"), now: NOW })
    ).toBeNull();
    expect(
      playHold({ lobby: lobbyWith(40_000), opponentUid: "opponent", link: cut(25_000, "offline"), now: NOW })
    ).toEqual({ since: NOW - 25_000, absent: "me" });
    expect(
      playHold({ lobby: lobbyWith(40_000), opponentUid: "opponent", link: cut(25_000, "slow"), now: NOW })
    ).toEqual({ since: NOW - 25_000, absent: "me" });
  });

  it("says the connection is slow", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root: Root = createRoot(container);
    await act(async () => {
      root.render(
        <ConnectionBanner opponentName="Coach-CAAG" connection="slow" />
      );
    });
    expect(
      container.querySelector('[data-testid="connection-banner"]')?.textContent
    ).toBe("⚠ Connection slowMoves may take a few seconds to arrive.");
    expect(container.textContent).not.toContain("disconnected");
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });
});

describe("heartbeat", () => {
  it("resolves with its stamp once the server holds it", async () => {
    let acknowledge: () => void = noop;
    vi.mocked(updateDoc).mockReturnValueOnce(
      new Promise<void>((resolve) => (acknowledge = resolve))
    );
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    let confirmed: number | null = null;
    void heartbeat("ABCD", "me").then((at) => (confirmed = at));
    await Promise.resolve();
    expect(confirmed).toBeNull();
    acknowledge();
    await vi.waitFor(() => {
      expect(confirmed).toBe(NOW);
    });
    vi.useRealTimers();
  });
});

describe("subscribeMatchLobby", () => {
  let lobbies: (LobbyDoc | null)[];
  let links: OwnLink[];
  let stop: () => void;
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    listens.count = 0;
    lobbies = [];
    links = [];
    stop = subscribeMatchLobby(
      {
        code: "ABCD",
        uid: "me",
        onLobby: (lobby) => {
          lobbies.push(lobby);
        },
        onLink: (link) => {
          links.push(link);
        },
      }
    );
  });
  afterEach(() => {
    stop();
    vi.useRealTimers();
  });

  it("reads the lobby and this coach's link from one listener", () => {
    snapshotListener?.(snap(false, 900));
    expect(listens.count).toBe(1);
    expect(lobbies).toEqual([doc(900)]);
    expect(links.at(-1)).toEqual({ state: "online", confirmedSeen: 900 });
  });

  it("calls the link slow while its writes wait over 6 s for the server", async () => {
    snapshotListener?.(snap(false, 900));
    snapshotListener?.(snap(true, 7000));
    await vi.advanceTimersByTimeAsync(5000);
    expect(links.at(-1)?.state).toBe("online");
    await vi.advanceTimersByTimeAsync(2000);
    expect(links.at(-1)).toEqual({ state: "slow", confirmedSeen: 900 });
    snapshotListener?.(snap(false, 7000));
    expect(links.at(-1)).toEqual({ state: "online", confirmedSeen: 7000 });
  });

  it("follows the browser going offline and back", () => {
    dispatchEvent(new Event("offline"));
    dispatchEvent(new Event("online"));
    expect(links.map((link) => link.state)).toEqual([
      "online",
      "offline",
      "online",
    ]);
  });
});
