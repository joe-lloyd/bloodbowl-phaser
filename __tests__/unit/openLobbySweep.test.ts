import type * as FirestoreModule from "firebase/firestore";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS, subscribeOpenLobbies } from "../../src/firebase/lobby";
import { fixtureValue } from "../../src/testing/fixtureValue";

const firestore = vi.hoisted(() => ({
  listeners: new Array<(snapshot: unknown) => void>(),
  stop: vi.fn(),
  updateDoc: vi.fn(() => Promise.resolve()),
}));

vi.mock("../../src/firebase/config", () => ({ getDb: () => ({}) }));

vi.mock("firebase/firestore", async (importOriginal) => ({
  ...(await importOriginal<typeof FirestoreModule>()),
  collection: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  limit: vi.fn(),
  doc: (_db: unknown, _path: string, code: string) => ({ code }),
  updateDoc: firestore.updateDoc,
  onSnapshot: (_query: unknown, next: (snapshot: unknown) => void) => {
    firestore.listeners.push(next);
    return firestore.stop;
  },
}));

const MINUTE = 60_000;

function listedLobby(lastSeen: number) {
  return {
    code: "QUIET1",
    hostUid: "host",
    guestUid: null,
    status: "lobby",
    listed: true,
    settings: DEFAULT_SETTINGS,
    players: {
      host: { uid: "host", displayName: "Host", team: null, ready: false, lastSeen },
    },
    createdAt: null,
  };
}

describe("the open games list", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-20T07:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("unlists a lobby whose host goes quiet after the list loaded, and stops when closed", () => {
    const close = subscribeOpenLobbies(vi.fn());
    const deliver = fixtureValue(firestore.listeners.at(-1));
    deliver({ docs: [{ data: () => listedLobby(Date.now() - 4 * MINUTE) }] });
    expect(firestore.updateDoc).not.toHaveBeenCalled();

    vi.advanceTimersByTime(2 * MINUTE);
    expect(firestore.updateDoc).toHaveBeenCalledTimes(1);
    expect(firestore.updateDoc).toHaveBeenCalledWith({ code: "QUIET1" }, { listed: false });

    close();
    vi.advanceTimersByTime(5 * MINUTE);
    expect(firestore.updateDoc).toHaveBeenCalledTimes(1);
    expect(firestore.stop).toHaveBeenCalledTimes(1);
  });
});
