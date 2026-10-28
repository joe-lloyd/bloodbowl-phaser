/**
 * GuestSession - the thin-client side of an online match.
 *
 * Holds no engine and no rules: sends protocol commands to the host, renders
 * whatever comes back (responses to own commands, broadcasts of the host's
 * play, resync snapshots). Detects lost messages by sequence gap and asks
 * for a snapshot resync instead of continuing from inconsistent state.
 */

import { HeadlessCommand, CommandResponse } from "../headless/protocol";
import {
  Envelope,
  BroadcastPayload,
  ChatPayload,
  HelloPayload,
  ResyncPayload,
  SelectionPayload,
  SequenceTracker,
  PROTOCOL_VERSION,
} from "./envelope";
import { Transport } from "./transport";

export interface GuestSessionOptions {
  transport: Transport;
  /** Sender id stamped on outgoing envelopes (guest uid) */
  selfId: string;
  /** Render the result of this guest's own command */
  onApply?: (response: CommandResponse) => void;
  /** Render the host's play live */
  onBroadcast?: (payload: BroadcastPayload) => void;
  /** Rebuild the whole view from a snapshot */
  onResync?: (payload: ResyncPayload) => void;
  onChat?: (payload: ChatPayload, from: string) => void;
  onHello?: (payload: HelloPayload, from: string) => void;
  /** The host's current own-team selection changed (cosmetic only). */
  onSelection?: (payload: SelectionPayload, from: string) => void;
}

export class GuestSession {
  private readonly seq = new SequenceTracker();
  private readonly unsubscribe: () => void;
  private readonly awaitingResponse = new Map<
    number,
    (response: CommandResponse) => void
  >();
  private resyncInFlight = false;
  /** Set when the host's page restarted: commands the old host never
   *  answered are released by the next resync. */
  private releaseOnResync = false;

  constructor(private readonly options: GuestSessionOptions) {
    this.unsubscribe = options.transport.subscribe((envelope) =>
      this.receive(envelope)
    );
  }

  /** Send a command to the host; resolves with the host's response. */
  sendCommand(command: HeadlessCommand): Promise<CommandResponse> {
    const { seq, ts } = this.seq.stamp();
    const promise = new Promise<CommandResponse>((resolve) => {
      this.awaitingResponse.set(seq, resolve);
    });
    void this.options.transport.send({
      kind: "command",
      payload: { command },
      seq,
      from: this.options.selfId,
      ts,
    });
    return promise;
  }

  async sendChat(text: string, senderName: string): Promise<void> {
    await this.send({ kind: "chat", payload: { text, senderName } });
  }

  /** Broadcast the guest's own current selection (cosmetic; fire-and-forget). */
  async sendSelection(playerId: string | null): Promise<void> {
    await this.send({ kind: "selection", payload: { playerId } });
  }

  async sendHello(payload?: Partial<HelloPayload>): Promise<void> {
    await this.send({
      kind: "hello",
      payload: { protocolVersion: PROTOCOL_VERSION, ...payload },
    });
  }

  async requestResync(): Promise<void> {
    if (this.resyncInFlight) return;
    this.resyncInFlight = true;
    await this.send({ kind: "resync-request", payload: {} });
  }

  close(): void {
    this.unsubscribe();
  }

  // ===== Incoming =====

  private receive(envelope: Envelope): void {
    // A resync carries complete, idempotent state: apply it regardless of
    // ordering — it heals gaps (and a replayed one is harmless).
    if (envelope.kind === "resync") {
      this.seq.acceptFrom(envelope.from, envelope.seq);
      this.resyncInFlight = false;
      this.options.onResync?.(envelope.payload);
      if (this.releaseOnResync) this.releaseUnanswered(envelope.payload);
      return;
    }

    // A hello opens a new host page whose seq starts again at 1. Its state
    // is whatever it last saved, so ask for it instead of trusting ours.
    if (envelope.kind === "hello") {
      this.seq.acceptFrom(envelope.from, envelope.seq);
      this.options.onHello?.(envelope.payload, envelope.from);
      this.releaseOnResync = this.awaitingResponse.size > 0;
      this.resyncInFlight = false;
      void this.requestResync();
      return;
    }

    const order = this.seq.classifyIncoming(envelope.from, envelope.seq);
    if (order === "duplicate") return;

    if (order === "gap") {
      void this.requestResync();
      // Fall through: the envelope itself is still valid and newest
    }

    switch (envelope.kind) {
      case "response": {
        const { commandSeq, response } = envelope.payload;
        const resolve = this.awaitingResponse.get(commandSeq);
        if (resolve) {
          this.awaitingResponse.delete(commandSeq);
          resolve(response);
        }
        this.options.onApply?.(response);
        break;
      }
      case "broadcast":
        this.options.onBroadcast?.(envelope.payload);
        break;
      case "chat":
        this.options.onChat?.(envelope.payload, envelope.from);
        break;
      case "selection":
        this.options.onSelection?.(envelope.payload, envelope.from);
        break;
      case "heartbeat":
        // liveness handled in the resilience layer
        break;
      default:
        break;
    }
  }

  /** The restarted host never saw these commands: refuse them so the UI
   *  stops waiting, with the state the host actually holds. */
  private releaseUnanswered(state: ResyncPayload): void {
    this.releaseOnResync = false;
    const unanswered = [...this.awaitingResponse.values()];
    this.awaitingResponse.clear();
    unanswered.forEach((resolve) =>
      resolve({
        ok: false,
        reason: "host-restarted",
        events: [],
        snapshot: state.snapshot,
        pendingDecision: state.pendingDecision,
      })
    );
  }

  private async send(
    partial: Omit<Envelope, "seq" | "from" | "ts">
  ): Promise<void> {
    await this.options.transport.send({
      ...partial,
      ...this.seq.stamp(),
      from: this.options.selfId,
    } as Envelope);
  }
}
