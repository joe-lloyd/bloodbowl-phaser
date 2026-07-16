/**
 * Network envelope - one wrapper for everything that crosses the wire.
 *
 * Payloads reuse the headless action protocol (HeadlessCommand /
 * CommandResponse / GameSnapshot): the network speaks exactly the language
 * the AI and CLI already exercise, so no rules or message shapes are
 * duplicated here.
 */

import { HeadlessCommand, CommandResponse, PendingDecision } from "../headless/protocol";
import { GameSnapshot } from "../headless/serialization";
import { Team } from "../types/Team";

/** Bumped whenever commands/snapshots change incompatibly. */
export const PROTOCOL_VERSION = 1;

export interface HelloPayload {
  protocolVersion: number;
  /** The sender's serialized team (optional — teams travel in the lobby doc) */
  team?: Team;
  /** Host→guest only: the match seed */
  seed?: number;
}

export interface CommandPayload {
  command: HeadlessCommand;
}

export interface ResponsePayload {
  /** seq of the command envelope this responds to */
  commandSeq: number;
  response: CommandResponse;
}

/** A host-initiated action's result, pushed so the guest spectates live. */
export interface BroadcastPayload {
  /** Absent for event-batch broadcasts (host played natively) */
  command?: HeadlessCommand;
  response: CommandResponse;
}

export interface ChatPayload {
  text: string;
  senderName: string;
}

export interface ResyncPayload {
  snapshot: GameSnapshot;
  pendingDecision: PendingDecision | null;
}

export type Envelope = { seq: number; from: string; ts: number } & (
  | { kind: "hello"; payload: HelloPayload }
  | { kind: "command"; payload: CommandPayload }
  | { kind: "response"; payload: ResponsePayload }
  | { kind: "broadcast"; payload: BroadcastPayload }
  | { kind: "chat"; payload: ChatPayload }
  | { kind: "heartbeat"; payload: Record<string, never> }
  | { kind: "resync"; payload: ResyncPayload }
  | { kind: "resync-request"; payload: Record<string, never> }
);

export type EnvelopeKind = Envelope["kind"];

/**
 * Per-sender ordering: assigns outgoing seq numbers and classifies incoming
 * ones. A duplicate is dropped; a gap means messages were missed and the
 * receiver must resync rather than continue from inconsistent state.
 */
export class SequenceTracker {
  private nextOut = 1;
  private lastIn = new Map<string, number>();

  nextOutgoing(): number {
    return this.nextOut++;
  }

  classifyIncoming(from: string, seq: number): "ok" | "duplicate" | "gap" {
    const last = this.lastIn.get(from) ?? 0;
    if (seq <= last) return "duplicate";
    const kind = seq === last + 1 ? "ok" : "gap";
    this.lastIn.set(from, seq);
    return kind;
  }

  /** After a resync the receiver accepts the stream from wherever it is. */
  acceptFrom(from: string, seq: number): void {
    this.lastIn.set(from, seq);
  }
}
