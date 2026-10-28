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
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  where,
} from "firebase/firestore";
import { getDb } from "../firebase/config";
import { Envelope } from "./envelope";
import { Transport } from "./transport";

/** `localStorage.bb_debug_net = "1"` logs every envelope with its timing. */
function traceNet(direction: "send" | "recv", envelope: Envelope): void {
  try {
    if (localStorage.getItem("bb_debug_net") !== "1") return;
  } catch {
    return;
  }
  console.debug(
    `[Net] ${direction} ${envelope.kind} seq=${envelope.seq} sent=${envelope.ts} now=${Date.now()}`
  );
}

export class FirestoreTransport implements Transport {
  private readonly handlers = new Set<(envelope: Envelope) => void>();
  private stopListening: () => void = () => {};
  private closed = false;
  /** Resolves once the listener covers everything after the existing log.
   *  Sends wait for it, so no reply to them can be missed. */
  private readonly live: Promise<void>;

  constructor(
    private readonly matchCode: string,
    /** Own sender id — own messages are echoed by Firestore and skipped */
    private readonly selfId: string
  ) {
    this.live = this.listen();
  }

  /**
   * Listen only for messages written after the newest one already in the
   * log. A match writes over a thousand messages, each carrying a full
   * snapshot, and a page that loaded the whole log on every reload fell
   * minutes behind. The hello handshake brings both sides up to date with
   * a resync instead. Messages are ordered by the server's clock: the two
   * coaches' clocks can disagree by seconds.
   */
  private async listen(): Promise<void> {
    const messages = collection(getDb(), "games", this.matchCode, "messages");
    const newest = await getDocs(
      query(messages, orderBy("at", "desc"), limit(1))
    );
    const since = (newest.docs[0]?.get("at") as Timestamp | undefined) ?? null;
    if (this.closed) return;
    this.stopListening = onSnapshot(
      since
        ? query(messages, where("at", ">", since), orderBy("at", "asc"))
        : query(messages, orderBy("at", "asc")),
      (snapshot) => this.deliver(snapshot.docChanges())
    );
  }

  private deliver(changes: DocumentChange[]): void {
    for (const change of changes) {
      if (change.type !== "added") continue;
      const envelope = change.doc.data() as Envelope;
      if (envelope.from === this.selfId) continue;
      traceNet("recv", envelope);
      this.handlers.forEach((handler) => handler(envelope));
    }
  }

  async send(envelope: Envelope): Promise<void> {
    await this.live;
    traceNet("send", envelope);
    await addDoc(
      collection(getDb(), "games", this.matchCode, "messages"),
      // Firestore rejects undefined fields; envelopes are JSON-safe already
      { ...JSON.parse(JSON.stringify(envelope)), at: serverTimestamp() }
    );
  }

  subscribe(handler: (envelope: Envelope) => void): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  close(): void {
    this.closed = true;
    this.stopListening();
    this.handlers.clear();
  }
}
