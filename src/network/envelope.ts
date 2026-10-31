/**
 * Network envelope - one wrapper for everything that crosses the wire.
 *
 * Payloads reuse the headless action protocol (HeadlessCommand /
 * CommandResponse / GameSnapshot): the network speaks exactly the language
 * the AI and CLI already exercise, so no rules or message shapes are
 * duplicated here.
 */

import { HeadlessCommand, PendingDecision } from "../headless/protocol";
import { Team } from "../types/Team";
import { GameSnapshot } from "../headless/serialization";
import { RNGState } from "../services/rng/RNGService";
import { MatchStatsSnapshot } from "../game/progression/MatchStats";
import { StepPrompt } from "../types/events";

/** Bumped whenever commands/snapshots change incompatibly. */
export const PROTOCOL_VERSION = 8;

export interface HelloPayload {
  protocolVersion: number;
  /** Commands the sender's engine has run; the side with more is ahead. */
  applied: number;
  checksum: string;
}

/**
 * One coach's command, with the checksum of their state before it. It goes
 * out before the sender's own screen plays it, so both screens show it at
 * about the same time.
 */
export interface CommandPayload {
  command: HeadlessCommand;
  before: string;
}

/**
 * Sent once the sender's engine has played out its own command: how many
 * commands it has now run, and the checksum of the state they led to.
 */
export interface SettledPayload {
  applied: number;
  checksum: string;
}

export interface ChatPayload {
  text: string;
  senderName: string;
}

/** Everything a side needs to rebuild the other's engine exactly. */
export interface LockstepState {
  snapshot: GameSnapshot;
  /** Players' stats and skills can change mid-match (inducements). */
  teams: [Team, Team];
  pending: PendingDecision | null;
  rng: RNGState;
  matchStats: MatchStatsSnapshot;
  applied: number;
}

/**
 * Cosmetic-only: "the player I currently have selected on my own team is
 * X (or none)". Never mutates game state and is not part of the ordered/
 * deduplicated command sequencing guarantees — the receiver just adopts the
 * latest value it sees.
 */
export interface SelectionPayload {
  playerId: string | null;
}

/**
 * Cosmetic-only: "I have this Dodge, Rush or Pick up prompt open (or none)".
 * The prompt is asked before its command is sent, so without this the
 * other coach sees nothing while it is open. Never touches game state;
 * the receiver shows the latest value it sees.
 */
export interface PromptPayload {
  prompt: StepPrompt | null;
}

export type Envelope = { seq: number; from: string; ts: number } & (
  | { kind: "hello"; payload: HelloPayload }
  | { kind: "command"; payload: CommandPayload }
  | { kind: "settled"; payload: SettledPayload }
  | { kind: "chat"; payload: ChatPayload }
  | { kind: "heartbeat"; payload: Record<string, never> }
  | { kind: "resync"; payload: LockstepState }
  | { kind: "resync-request"; payload: Record<string, never> }
  | { kind: "selection"; payload: SelectionPayload }
  | { kind: "prompt"; payload: PromptPayload }
);

export type EnvelopeKind = Envelope["kind"];

/**
 * Per-sender ordering: assigns outgoing seq numbers and classifies incoming
 * ones. A duplicate is dropped; a gap means messages were missed and the
 * receiver must resync rather than continue from inconsistent state.
 */
export class SequenceTracker {
  private nextOut = 1;
  private lastTs = 0;
  private lastIn = new Map<string, number>();

  /**
   * The next outgoing seq and send time. Firestore orders the log by `ts`
   * and breaks ties by random doc id, so two sends in one millisecond could
   * swap; each stamp is at least 1 ms after the previous one.
   */
  stamp(): { seq: number; ts: number } {
    this.lastTs = Math.max(Date.now(), this.lastTs + 1);
    return { seq: this.nextOut++, ts: this.lastTs };
  }

  classifyIncoming(from: string, seq: number): "ok" | "duplicate" | "gap" {
    const last = this.lastIn.get(from) ?? 0;
    if (seq <= last) return "duplicate";
    const kind = seq === last + 1 ? "ok" : "gap";
    this.lastIn.set(from, seq);
    return kind;
  }

  /** After a resync, or a hello opening a new session on the other side
   *  (a page load restarts its seq at 1), accept the stream from here. */
  acceptFrom(from: string, seq: number): void {
    this.lastIn.set(from, seq);
  }
}
