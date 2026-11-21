import { type HeadlessCommand, type PendingDecision } from "../headless/protocol";
import { type Team } from "../types/Team";
import { type GameSnapshot } from "../headless/serialization";
import { type RNGState } from "../services/rng/RNGService";
import { type MatchStatsSnapshot } from "../game/progression/MatchStats";
import { type StepPrompt } from "../types/events";

export const PROTOCOL_VERSION = 19;

export interface HelloPayload {
  protocolVersion: number;

  applied: number;
  checksum: string;
}

export interface CommandPayload {
  command: HeadlessCommand;
  before: string;
}

export interface SettledPayload {
  applied: number;
  checksum: string;
}

export interface ChatPayload {
  text: string;
  senderName: string;
}

export interface CatchUpPayload {
  from: number;
  commands: HeadlessCommand[];
}

export interface LockstepState {
  snapshot: GameSnapshot;

  teams: [Team, Team];
  pending: PendingDecision | null;
  rng: RNGState;
  matchStats: MatchStatsSnapshot;
  applied: number;

  replay: HeadlessCommand[];

  checksum: string;
}

export interface SelectionPayload {
  playerId: string | null;
}

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
  | { kind: "catch-up"; payload: CatchUpPayload }
  | { kind: "resync-request"; payload: Record<string, never> }
  | { kind: "selection"; payload: SelectionPayload }
  | { kind: "prompt"; payload: PromptPayload }
);


export class SequenceTracker {
  private nextOut = 1;
  private lastTs = 0;
  private lastIn = new Map<string, number>();

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

  acceptFrom(from: string, seq: number): void {
    this.lastIn.set(from, seq);
  }
}
