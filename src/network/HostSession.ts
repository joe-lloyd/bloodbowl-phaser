/**
 * HostSession - the authoritative side of an online match.
 *
 * Owns the single live engine (via HeadlessGame). Guest commands arrive as
 * envelopes, pass the OwnershipGate, execute, and the response goes back;
 * the host's own actions execute locally and are pushed as broadcasts so the
 * guest spectates them live. There is no other copy of the rules anywhere.
 */

import { HeadlessGame } from "../headless/HeadlessGame";
import {
  HeadlessCommand,
  CommandResponse,
  EmittedEvent,
} from "../headless/protocol";
import {
  Envelope,
  ChatPayload,
  HelloPayload,
  SequenceTracker,
  PROTOCOL_VERSION,
} from "./envelope";
import { Transport } from "./transport";
import { checkOwnership, GateContext } from "./OwnershipGate";

export interface HostSessionOptions {
  transport: Transport;
  game: HeadlessGame;
  hostTeamId: string;
  guestTeamId: string;
  /** Sender id stamped on outgoing envelopes (host uid) */
  selfId: string;
  /** Host UI: render the result of a guest's command */
  onGuestApplied?: (
    response: CommandResponse,
    command: HeadlessCommand
  ) => void;
  onChat?: (payload: ChatPayload, from: string) => void;
  onHello?: (payload: HelloPayload, from: string) => void;
  /** Bracket guest-command execution (e.g. to pause the event broadcaster
   *  so the guest doesn't see its own command's events twice) */
  onGuestExecuteStart?: () => void;
  onGuestExecuteEnd?: () => void;
}

export class HostSession {
  private readonly seq = new SequenceTracker();
  private readonly unsubscribe: () => void;
  /** Commands never interleave: each waits for the previous to settle */
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly options: HostSessionOptions) {
    this.unsubscribe = options.transport.subscribe((envelope) =>
      this.receive(envelope)
    );
  }

  /** Execute one of the host's own commands and broadcast it to the guest. */
  async executeLocal(command: HeadlessCommand): Promise<CommandResponse> {
    return this.enqueue(async () => {
      const verdict = checkOwnership(
        command,
        this.options.hostTeamId,
        this.gateContext()
      );
      if (!verdict.allowed) {
        return this.rejection(verdict.reason);
      }
      const response = await this.options.game.execute(command);
      await this.send({ kind: "broadcast", payload: { command, response } });
      return response;
    });
  }

  async sendChat(text: string, senderName: string): Promise<void> {
    await this.send({ kind: "chat", payload: { text, senderName } });
  }

  async sendHello(payload?: Partial<HelloPayload>): Promise<void> {
    await this.send({
      kind: "hello",
      payload: { protocolVersion: PROTOCOL_VERSION, ...payload },
    });
  }

  /**
   * Push a batch of natively-played host events (with the resulting
   * snapshot) so the guest spectates the host's own moves live.
   */
  async broadcastEvents(events: EmittedEvent[]): Promise<void> {
    await this.send({
      kind: "broadcast",
      payload: {
        response: {
          ok: true,
          events,
          snapshot: this.options.game.snapshot(),
          pendingDecision: this.options.game.pendingDecision(),
        },
      },
    });
  }

  /** Push a full snapshot so the guest can rebuild wholesale. */
  async sendResync(): Promise<void> {
    await this.send({
      kind: "resync",
      payload: {
        snapshot: this.options.game.snapshot(),
        pendingDecision: this.options.game.pendingDecision(),
      },
    });
  }

  close(): void {
    this.unsubscribe();
  }

  // ===== Incoming =====

  private receive(envelope: Envelope): void {
    // The host is authoritative: duplicates are dropped, but a gap in guest
    // commands needs no host-side recovery (the guest never got a response
    // and will resync/retry) — just accept the stream from here.
    const order = this.seq.classifyIncoming(envelope.from, envelope.seq);
    if (order === "duplicate") return;

    switch (envelope.kind) {
      case "command":
        void this.enqueue(() =>
          this.handleGuestCommand(envelope.payload.command, envelope.seq)
        );
        break;
      case "resync-request":
        void this.enqueue(() => this.sendResync());
        break;
      case "chat":
        this.options.onChat?.(envelope.payload, envelope.from);
        break;
      case "hello":
        this.options.onHello?.(envelope.payload, envelope.from);
        break;
      case "heartbeat":
        // liveness handled in the resilience layer
        break;
      default:
        // response/broadcast/resync are host→guest kinds; never arrive here
        break;
    }
  }

  private async handleGuestCommand(
    command: HeadlessCommand,
    commandSeq: number
  ): Promise<void> {
    const verdict = checkOwnership(
      command,
      this.options.guestTeamId,
      this.gateContext()
    );
    let response: CommandResponse;
    if (verdict.allowed) {
      this.options.onGuestExecuteStart?.();
      try {
        response = await this.options.game.execute(command);
      } finally {
        this.options.onGuestExecuteEnd?.();
      }
    } else {
      response = this.rejection(verdict.reason);
    }

    await this.send({ kind: "response", payload: { commandSeq, response } });
    if (response.ok) {
      this.options.onGuestApplied?.(response, command);
    }
  }

  // ===== Helpers =====

  private gateContext(): GateContext {
    const gameService = this.options.game.ctx.gameService;
    return {
      activeTeamId: gameService.getState().activeTeamId,
      pendingDecision: this.options.game.pendingDecision(),
      teamIdOfPlayer: (playerId) => gameService.getPlayerById(playerId)?.teamId,
      hostTeamId: this.options.hostTeamId,
      phase: gameService.getState().phase,
    };
  }

  private rejection(reason: string): CommandResponse {
    return {
      ok: false,
      reason,
      events: [],
      snapshot: this.options.game.snapshot(),
      pendingDecision: this.options.game.pendingDecision(),
    };
  }

  private enqueue<T>(work: () => Promise<T>): Promise<T> {
    const next = this.queue.then(work, work);
    this.queue = next.catch(() => undefined);
    return next;
  }

  private async send(
    partial: Omit<Envelope, "seq" | "from" | "ts">
  ): Promise<void> {
    await this.options.transport.send({
      ...partial,
      seq: this.seq.nextOutgoing(),
      from: this.options.selfId,
      ts: Date.now(),
    } as Envelope);
  }
}

export { PROTOCOL_VERSION };
