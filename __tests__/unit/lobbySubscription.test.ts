import { describe, expect, it, vi } from "vitest";
import type * as Firestore from "firebase/firestore";

interface FakeSnapshot {
  exists: () => boolean;
  data: () => object | undefined;
  metadata: { fromCache: boolean; hasPendingWrites: boolean };
}
type Listener = (snapshot: FakeSnapshot) => void;
const listen = vi.hoisted(
  (): { options: unknown; listener: Listener | undefined } => ({
    options: undefined,
    listener: undefined,
  })
);
vi.mock("firebase/firestore", async (load) => ({
  ...(await load<typeof Firestore>()),
  doc: vi.fn(() => "lobby-reference"),
  onSnapshot: vi.fn((_ref: unknown, options: unknown, listener: Listener) => {
    listen.options = options;
    listen.listener = listener;
    return vi.fn();
  }),
}));
vi.mock("../../src/firebase/config", () => ({ getDb: () => ({}) }));

import { DEFAULT_SETTINGS, subscribeLobby } from "../../src/firebase/lobby";

const lobbyData = {
  code: "GONE01",
  hostUid: "host",
  guestUid: null,
  status: "lobby",
  settings: DEFAULT_SETTINGS,
  players: {
    host: { uid: "host", displayName: "Host", team: null, ready: false },
  },
  createdAt: null,
};

function snapshot(data: object | undefined, fromCache: boolean): FakeSnapshot {
  return {
    exists: () => data !== undefined,
    data: () => data,
    metadata: { fromCache, hasPendingWrites: false },
  };
}

function subscribe() {
  const seen: string[] = [];
  subscribeLobby("GONE01", (lobby) => {
    seen.push(lobby === "closed" ? "closed" : lobby.code);
  });
  const send = (data: object | undefined, fromCache: boolean) => {
    listen.listener?.(snapshot(data, fromCache));
  };
  return { seen, send };
}

describe("following a lobby", () => {
  it("listens for the server confirming a lobby the cache did not have", () => {
    const { seen, send } = subscribe();
    expect(listen.options).toEqual({ includeMetadataChanges: true });
    send(undefined, true);
    expect(seen).toEqual([]);
    send(undefined, false);
    expect(seen).toEqual(["closed"]);
  });

  it("reports a lobby once when only the snapshot metadata changes", () => {
    const { seen, send } = subscribe();
    send(lobbyData, true);
    send(lobbyData, false);
    expect(seen).toEqual(["GONE01"]);
    send({ ...lobbyData, guestUid: "guest" }, false);
    expect(seen).toEqual(["GONE01", "GONE01"]);
  });
});
