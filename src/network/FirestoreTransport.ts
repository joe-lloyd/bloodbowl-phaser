/**
 * FirestoreTransport - envelopes over a games/{code}/messages subcollection.
 *
 * One document write per send, one onSnapshot listener per client (the
 * free-tier posture from the design). Delivery order is by write time;
 * correctness does not depend on it — per-sender seq numbers detect gaps
 * and trigger snapshot resync (see envelope.ts / GuestSession).
 */

import {
  addDoc,
  collection,
  DocumentChange,
  onSnapshot,
  orderBy,
  query,
} from "firebase/firestore";
import { getDb } from "../firebase/config";
import { Envelope } from "./envelope";
import { Transport } from "./transport";

export class FirestoreTransport implements Transport {
  private readonly handlers = new Set<(envelope: Envelope) => void>();
  private readonly stopListening: () => void;
  /** Resolves once the listener has passed the log written before this page
   *  loaded. Sends wait for it, so no reply to them can land in that log. */
  private readonly live: Promise<void>;

  constructor(
    private readonly matchCode: string,
    /** Own sender id — own messages are echoed by Firestore and skipped */
    private readonly selfId: string
  ) {
    const messages = query(
      collection(getDb(), "games", matchCode, "messages"),
      orderBy("ts", "asc")
    );
    // The first server snapshot is the log written before this page loaded.
    // Replaying it would re-run old commands under a fresh seq tracker; the
    // hello handshake brings both sides up to date with a resync instead.
    // Metadata changes are included so an empty log still marks the start.
    let isLive = false;
    let markLive = () => {};
    this.live = new Promise((resolve) => (markLive = resolve));
    this.stopListening = onSnapshot(
      messages,
      { includeMetadataChanges: true },
      (snapshot) => {
        if (!isLive) {
          isLive = !snapshot.metadata.fromCache;
          if (isLive) markLive();
          return;
        }
        this.deliver(snapshot.docChanges());
      }
    );
  }

  private deliver(changes: DocumentChange[]): void {
    for (const change of changes) {
      if (change.type !== "added") continue;
      const envelope = change.doc.data() as Envelope;
      if (envelope.from === this.selfId) continue;
      this.handlers.forEach((handler) => handler(envelope));
    }
  }

  async send(envelope: Envelope): Promise<void> {
    await this.live;
    await addDoc(
      collection(getDb(), "games", this.matchCode, "messages"),
      // Firestore rejects undefined fields; envelopes are JSON-safe already
      JSON.parse(JSON.stringify(envelope))
    );
  }

  subscribe(handler: (envelope: Envelope) => void): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  close(): void {
    this.stopListening();
    this.handlers.clear();
  }
}
