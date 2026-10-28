/**
 * FirestoreTransport against a stand-in onSnapshot: a page load must not
 * replay the match's message log, and nothing it sends may be written
 * before its listener is past that log.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Envelope } from "../../../src/network/envelope";

type Listener = (snapshot: {
  metadata: { fromCache: boolean };
  docChanges(): { type: string; doc: { data(): Envelope } }[];
}) => void;

const firestore = vi.hoisted(() => ({
  listener: null as Listener | null,
  written: [] as Envelope[],
}));

vi.mock("../../../src/firebase/config", () => ({ getDb: () => ({}) }));
vi.mock("firebase/firestore", () => ({
  collection: () => ({}),
  query: () => ({}),
  orderBy: () => ({}),
  onSnapshot: (_query: unknown, _options: unknown, listener: Listener) => {
    firestore.listener = listener;
    return () => {};
  },
  addDoc: async (_collection: unknown, data: Envelope) => {
    firestore.written.push(data);
  },
}));

const { FirestoreTransport } =
  await import("../../../src/network/FirestoreTransport");

const envelope = (seq: number, from = "host-uid"): Envelope => ({
  kind: "chat",
  payload: { text: `#${seq}`, senderName: "Host" },
  seq,
  from,
  ts: seq,
});

function snapshot(fromCache: boolean, envelopes: Envelope[]) {
  firestore.listener!({
    metadata: { fromCache },
    docChanges: () =>
      envelopes.map((data) => ({ type: "added", doc: { data: () => data } })),
  });
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  firestore.listener = null;
  firestore.written = [];
});

describe("FirestoreTransport", () => {
  it("skips the log written before the page loaded and delivers what follows", async () => {
    const transport = new FirestoreTransport("CODE", "guest-uid");
    const received: number[] = [];
    transport.subscribe((incoming) => received.push(incoming.seq));

    snapshot(true, [envelope(1)]); // local cache
    snapshot(false, [envelope(2), envelope(3)]); // the server's view of the log
    snapshot(false, [envelope(4), envelope(5, "guest-uid")]);

    expect(received).toEqual([4]);
  });

  it("an empty log still opens the stream", async () => {
    const transport = new FirestoreTransport("CODE", "guest-uid");
    const received: number[] = [];
    transport.subscribe((incoming) => received.push(incoming.seq));

    snapshot(false, []);
    snapshot(false, [envelope(1)]);

    expect(received).toEqual([1]);
  });

  it("holds sends until the listener is past the old log", async () => {
    const transport = new FirestoreTransport("CODE", "guest-uid");
    const sent = transport.send(envelope(1, "guest-uid"));
    await flush();
    expect(firestore.written).toEqual([]);

    snapshot(false, []);
    await sent;
    expect(firestore.written.map((written) => written.seq)).toEqual([1]);
  });
});
