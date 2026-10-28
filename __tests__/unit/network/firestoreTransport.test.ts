/**
 * FirestoreTransport against a stand-in Firestore: a page load must not
 * download or replay the match's message log, and nothing it sends may be
 * written before its listener covers what comes next.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Envelope } from "../../../src/network/envelope";

type Listener = (snapshot: {
  docChanges(): { type: string; doc: { data(): Envelope } }[];
}) => void;

const firestore = vi.hoisted(() => ({
  listener: null as Listener | null,
  /** The query the listener was attached with, as plain parts */
  listened: [] as unknown[],
  newestAt: null as number | null,
  written: [] as Record<string, unknown>[],
  newestLookup: Promise.resolve(),
}));

vi.mock("../../../src/firebase/config", () => ({ getDb: () => ({}) }));
vi.mock("firebase/firestore", () => ({
  collection: () => "messages",
  query: (...parts: unknown[]) => parts,
  orderBy: (field: string, dir: string) => ["orderBy", field, dir],
  where: (field: string, op: string, value: unknown) => [
    "where",
    field,
    op,
    value,
  ],
  limit: (n: number) => ["limit", n],
  serverTimestamp: () => "server-time",
  getDocs: async () => {
    await firestore.newestLookup;
    return {
      docs:
        firestore.newestAt === null ? [] : [{ get: () => firestore.newestAt }],
    };
  },
  onSnapshot: (listened: unknown[], listener: Listener) => {
    firestore.listened = listened;
    firestore.listener = listener;
    return () => {};
  },
  addDoc: async (_collection: unknown, data: Record<string, unknown>) => {
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

function arrive(envelopes: Envelope[]) {
  firestore.listener!({
    docChanges: () =>
      envelopes.map((data) => ({ type: "added", doc: { data: () => data } })),
  });
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  firestore.listener = null;
  firestore.listened = [];
  firestore.newestAt = null;
  firestore.written = [];
  firestore.newestLookup = Promise.resolve();
});

describe("FirestoreTransport", () => {
  it("listens only for messages after the newest one in the log", async () => {
    firestore.newestAt = 1234;
    const transport = new FirestoreTransport("CODE", "guest-uid");
    await flush();

    expect(firestore.listened).toContainEqual(["where", "at", ">", 1234]);
    const received: number[] = [];
    transport.subscribe((incoming) => received.push(incoming.seq));
    arrive([envelope(4), envelope(5, "guest-uid")]);
    expect(received).toEqual([4]);
  });

  it("an empty log listens from the start", async () => {
    const transport = new FirestoreTransport("CODE", "guest-uid");
    await flush();

    expect(firestore.listened).not.toContainEqual(
      expect.arrayContaining(["where"])
    );
    const received: number[] = [];
    transport.subscribe((incoming) => received.push(incoming.seq));
    arrive([envelope(1)]);
    expect(received).toEqual([1]);
  });

  it("holds sends until the listener is attached, and stamps them with the server's time", async () => {
    let lookedUp = () => {};
    firestore.newestLookup = new Promise((resolve) => (lookedUp = resolve));
    const transport = new FirestoreTransport("CODE", "guest-uid");
    const sent = transport.send(envelope(1, "guest-uid"));
    await flush();
    expect(firestore.written).toEqual([]);

    lookedUp();
    await sent;
    expect(firestore.written).toEqual([
      expect.objectContaining({ seq: 1, at: "server-time" }),
    ]);
    expect(firestore.listener).not.toBeNull();
  });
});
