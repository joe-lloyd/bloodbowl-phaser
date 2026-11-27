import { parseEnvelope, parseMessageTimestamp, serializableEnvelope } from "../boundary/networkEnvelope";
import {
  addDoc,
  collection,
  type DocumentChange,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  where,
} from "firebase/firestore";
import { getDb } from "../firebase/config";
import { type Envelope } from "./envelope";
import { type Transport } from "./transport";

function traceNet(direction: "send" | "recv", envelope: Envelope): void {
  try {
    if (localStorage.getItem("bb_debug_net") !== "1") return;
  } catch {
    return;
  }
  console.debug(
    `[Net] ${direction} ${envelope.kind} seq=${String(envelope.seq)} sent=${String(envelope.ts)} now=${String(Date.now())} bytes=${String(JSON.stringify(envelope).length)}`
  );
}

export class FirestoreTransport implements Transport {
  private readonly handlers = new Set<(envelope: Envelope) => void>();
  private stopListening: (() => void) | undefined;
  private closed = false;

  private readonly live: Promise<void>;

  private readonly matchCode: string;
  private readonly selfId: string;
  constructor(
    matchCode: string,

    selfId: string
  ) {
    this.matchCode = matchCode;
    this.selfId = selfId;
    this.live = this.listen();
  }

  private async listen(): Promise<void> {
    const messages = collection(getDb(), "games", this.matchCode, "messages");
    const newest = await getDocs(
      query(messages, orderBy("at", "desc"), limit(1))
    );
    if (this.closed) return;
    const at: unknown = newest.docs[0]?.get("at");
    const since = parseMessageTimestamp(at);
    this.stopListening = onSnapshot(
      since
        ? query(messages, where("at", ">", since), orderBy("at", "asc"))
        : query(messages, orderBy("at", "asc")),
      (snapshot) => {
        this.deliver(snapshot.docChanges());
      }
    );
  }

  private deliver(changes: DocumentChange[]): void {
    for (const change of changes) {
      if (change.type !== "added") continue;
      const envelope = parseEnvelope(change.doc.data());
      if (envelope.from === this.selfId) continue;
      traceNet("recv", envelope);
      this.handlers.forEach((handler) => {
        handler(envelope);
      });
    }
  }

  async send(envelope: Envelope): Promise<void> {
    await this.live;
    traceNet("send", envelope);
    await addDoc(
      collection(getDb(), "games", this.matchCode, "messages"),

      { ...serializableEnvelope(envelope), at: serverTimestamp() }
    );
  }

  subscribe(handler: (envelope: Envelope) => void): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  close(): void {
    this.closed = true;
    this.stopListening?.();
    this.handlers.clear();
  }
}
