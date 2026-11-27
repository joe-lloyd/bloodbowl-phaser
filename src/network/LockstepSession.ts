type EnvelopeBody = Envelope extends infer Variant
  ? Variant extends Envelope ? Omit<Variant, "seq" | "from" | "ts"> : never
  : never;

import { HeadlessGame } from "../headless/HeadlessGame";
import {
  type CommandResponse,
  type HeadlessCommand,
} from "../headless/protocol";
import { stateChecksum } from "../headless/checksum";
import { pairSeating, pairTeams } from "../game/seating";
import { whenEngineQuiet, withoutPacing } from "../game/core/GameFlowManager";
import {
  applySnapshotToTeams,
  deserializeGameState,
  restoreTeam,
  replaceFields,
} from "../headless/serialization";
import {
  type CatchUpPayload,
  type ChatPayload,
  type Envelope,
  type HelloPayload,
  type LockstepState,
  PROTOCOL_VERSION,
  type SelectionPayload,
  type PromptPayload,
  SequenceTracker,
  type SettledPayload,
} from "./envelope";
import { type Transport } from "./transport";
import { type StepPrompt } from "../types/events";
import {
  checkOwnership,
  gateContextOf,
  refusalOnceQuiet,
} from "./OwnershipGate";

export interface LockstepSessionOptions {
  transport: Transport;
  game: HeadlessGame;

  selfId: string;
  myTeamId: string;
  peerTeamId: string;
  hostTeamId: string;

  appliedCommands?: number;
  onHello?: (payload: HelloPayload, from: string) => void;
  onChat?: (payload: ChatPayload, from: string) => void;
  onSelection?: (payload: SelectionPayload, from: string) => void;
  onPrompt?: (payload: PromptPayload, from: string) => void;

  onPeerCommand?: (command: HeadlessCommand) => void;

  onApplied?: (command: HeadlessCommand, own: boolean) => void;

  onResynced?: () => void;

  onDesync?: (detail: string) => void;
}

export function restoreEngine(
  game: HeadlessGame,
  state: Omit<LockstepState, "applied" | "replay">
): void {
  const { gameService, rng, matchStats } = game.ctx;
  const [team1, team2] = pairTeams(pairSeating(gameService.getSeating()));

  restoreTeam(team1, state.teams[0]);
  restoreTeam(team2, state.teams[1]);
  applySnapshotToTeams(state.snapshot, [team1, team2]);
  replaceFields(gameService.getState(), deserializeGameState(state.snapshot));
  if (state.snapshot.turnManager) {
    gameService.restoreTurnManagerState(state.snapshot.turnManager);
  }

  gameService.resyncSetupFromTeams();
  rng.restoreState(state.rng);
  matchStats.restoreState(state.matchStats);
  game.adoptPending(state.pending);
}

export class LockstepSession {
  private readonly seq = new SequenceTracker();
  private readonly unsubscribe: () => void;

  private queue: Promise<unknown> = Promise.resolve();

  private applied: number;

  private awaitingResync = false;

  private awaitingCatchUp = false;

  private log: { before: string; command: HeadlessCommand }[] = [];
  private logFrom: number;

  private atRest: LockstepState | null = null;

  private readonly options: LockstepSessionOptions;
  constructor(options: LockstepSessionOptions) {
    this.options = options;
    this.applied = options.appliedCommands ?? 0;
    this.logFrom = this.applied;
    this.unsubscribe = options.transport.subscribe((envelope) => {
      this.receive(envelope);
    });
  }

  async whenIdle(): Promise<void> {
    let seen: Promise<unknown>;
    do {
      seen = this.queue;
      await seen;
    } while (seen !== this.queue);
  }

  appliedCommands(): number {
    return this.applied;
  }

  replaySaved(saved: HeadlessCommand[]): Promise<void> {
    if (saved.length === 0) return Promise.resolve();
    return this.enqueue(() => this.runMissed(saved));
  }

  run(command: HeadlessCommand): Promise<CommandResponse> {
    return this.enqueue(async () => {
      const { game, myTeamId, hostTeamId } = this.options;
      const refusal = await refusalOnceQuiet({
        game,
        command,
        senderTeamId: myTeamId,
        hostTeamId,
      });
      if (refusal) return refusal;

      const before = this.aboutToRun();
      void this.send({ kind: "command", payload: { command, before } });
      const response = await game.execute(command);
      if (!response.ok) return response;
      this.record(before, command);
      this.options.onApplied?.(command, true);

      await whenEngineQuiet();
      void this.send({
        kind: "settled",
        payload: { applied: this.applied, checksum: stateChecksum(game) },
      });
      return response;
    });
  }

  sendHello(): Promise<void> {
    return this.enqueue(() => this.announce());
  }

  private async announce(): Promise<void> {
    this.awaitingCatchUp = true;
    await this.send({
      kind: "hello",
      payload: {
        protocolVersion: PROTOCOL_VERSION,
        applied: this.applied,
        checksum: stateChecksum(this.options.game),
      },
    });
  }

  async sendChat(text: string, senderName: string): Promise<void> {
    await this.send({ kind: "chat", payload: { text, senderName } });
  }

  async sendSelection(playerId: string | null): Promise<void> {
    await this.send({ kind: "selection", payload: { playerId } });
  }

  async sendPrompt(prompt: StepPrompt | null): Promise<void> {
    await this.send({ kind: "prompt", payload: { prompt } });
  }

  async requestResync(): Promise<void> {
    if (this.awaitingResync) return;
    this.awaitingResync = true;
    await this.send({ kind: "resync-request", payload: {} });
  }

  captureState(): LockstepState {
    const { game } = this.options;
    if (!game.isAtRest() && this.atRest) {
      return {
        ...this.atRest,
        replay: this.log
          .slice(this.atRest.applied - this.logFrom)
          .map((entry) => entry.command),
        checksum: stateChecksum(game),
      };
    }
    return {
      snapshot: game.snapshot(),
      teams: [...pairTeams(pairSeating(game.ctx.gameService.getSeating()))],
      pending: game.pendingDecision(),
      rng: game.ctx.rng.captureState(),
      matchStats: game.ctx.matchStats.captureState(),
      applied: this.applied,
      replay: [],
      checksum: stateChecksum(game),
    };
  }

  close(): void {
    this.unsubscribe();
  }

  private receive(envelope: Envelope): void {
    if (envelope.kind === "hello") {
      this.receiveHello(envelope);
      return;
    }
    if (envelope.kind === "catch-up") {
      this.seq.acceptFrom(envelope.from, envelope.seq);
      const catchUp = envelope.payload;
      void this.enqueue(async () => this.replay(catchUp));
      return;
    }
    if (envelope.kind === "resync") {
      this.seq.acceptFrom(envelope.from, envelope.seq);
      const state = envelope.payload;
      void this.enqueue(async () => this.restore(state));
      return;
    }

    const order = this.seq.classifyIncoming(envelope.from, envelope.seq);
    if (order === "duplicate") return;
    if (order === "gap") void this.requestResync();

    this.dispatch(envelope);
  }

  private receiveHello(envelope: Extract<Envelope, { kind: "hello" }>): void {
    this.seq.acceptFrom(envelope.from, envelope.seq);
    this.options.onHello?.(envelope.payload, envelope.from);

    if (envelope.payload.protocolVersion !== PROTOCOL_VERSION) {
      this.close();
      return;
    }
    const { applied, checksum } = envelope.payload;

    this.awaitingCatchUp = false;
    void this.enqueue(async () => {
      if (this.applied < applied) await this.requestResync();
      else await this.sendCatchUp(applied, checksum);
    });
  }

  private dispatch(envelope: Envelope): void {
    if (envelope.kind === "command") {
      const { command, before } = envelope.payload;
      void this.enqueue(() => this.applyPeerCommand(command, before));
      return;
    }
    if (envelope.kind === "settled") {
      void this.enqueue(() => this.checkSettled(envelope.payload));
      return;
    }
    if (envelope.kind === "resync-request") {
      void this.enqueue(() => this.sendResync());
      return;
    }
    this.deliverSignal(envelope);
  }

  private deliverSignal(envelope: Exclude<Envelope, { kind: "command" | "settled" | "resync-request" }>): void {
    if (envelope.kind === "chat") this.options.onChat?.(envelope.payload, envelope.from);
    else if (envelope.kind === "selection") this.options.onSelection?.(envelope.payload, envelope.from);
    else if (envelope.kind === "prompt") this.options.onPrompt?.(envelope.payload, envelope.from);
  }

  private async applyPeerCommand(
    command: HeadlessCommand,
    before: string
  ): Promise<void> {
    if (this.awaitingResync || this.awaitingCatchUp) return;
    const { game } = this.options;

    await whenEngineQuiet();
    const mine = this.aboutToRun();
    if (mine !== before) {
      this.desync(`before ${command.type}: ${mine} here, ${before} there`);
      return;
    }
    const verdict = checkOwnership(
      command,
      this.options.peerTeamId,
      gateContextOf(game, this.options.hostTeamId)
    );
    if (!verdict.allowed) {
      this.desync(`${command.type} refused here: ${verdict.reason}`);
      return;
    }
    this.options.onPeerCommand?.(command);
    const response = await game.execute(command);

    if (!response.ok) {
      console.warn(
        `[Lockstep] peer ${command.type} refused here: ${response.reason ?? "no reason"}`
      );
      return;
    }
    this.record(mine, command);
    this.options.onApplied?.(command, false);
  }

  private async checkSettled({
    applied,
    checksum,
  }: SettledPayload): Promise<void> {
    if (this.awaitingResync || this.awaitingCatchUp) return;
    await whenEngineQuiet();
    if (this.applied < applied) {
      this.desync(
        `ran ${String(this.applied)} commands here, ${String(applied)} there`
      );
      return;
    }
    if (this.applied > applied) return;
    const now = stateChecksum(this.options.game);
    if (now !== checksum) {
      this.desync(
        `after command ${String(applied)}: ${now} here, ${checksum} there`
      );
    }
  }

  private desync(detail: string): void {
    console.warn(`[Lockstep] desync ${detail}`);

    this.logDesyncState();
    this.options.onDesync?.(detail);
    void this.requestResync();
  }

  private logDesyncState(): void {
    try {
      if (localStorage.getItem("bb_debug_net") === "1") {
        const s = this.options.game.snapshot();
        console.warn(
          `[Lockstep] state ${JSON.stringify({
            phase: s.phase,
            subPhase: s.subPhase,
            active: s.activeTeamId,
            setup: s.setup,
            weather: s.weather,
            players: s.teams.map((t) =>
              t.players.map((p) => [p.position?.x, p.position?.y, p.status])
            ),
          })}`
        );
      }
    } catch {
      return;
    }
  }

  private async sendResync(): Promise<void> {
    await whenEngineQuiet();

    this.awaitingCatchUp = false;
    await this.send({ kind: "resync", payload: this.captureState() });
  }

  private async sendCatchUp(from: number, checksum: string): Promise<void> {
    await whenEngineQuiet();
    const start = from - this.logFrom;
    const ranFromSameState =
      start === this.log.length
        ? checksum === stateChecksum(this.options.game)
        : this.log[start]?.before === checksum;
    if (start < 0 || !ranFromSameState) return this.sendResync();
    await this.send({
      kind: "catch-up",
      payload: {
        from,
        commands: this.log.slice(start).map((entry) => entry.command),
      },
    });
  }

  private async replay({ from, commands }: CatchUpPayload): Promise<void> {
    await whenEngineQuiet();

    if (!this.awaitingCatchUp) return;
    this.awaitingCatchUp = false;
    if (this.applied !== from) {
      this.desync(
        `catch-up from ${String(from)}, ${String(this.applied)} run here`
      );
      return;
    }
    await this.runMissed(commands);
  }

  private async runMissed(
    commands: HeadlessCommand[],
    expected?: string
  ): Promise<void> {
    const { game } = this.options;
    const refused = await withoutPacing(async () => {
      for (const command of commands) {
        await whenEngineQuiet();
        const before = this.aboutToRun();
        const response = await game.execute(command);
        if (!response.ok) return command;
        this.record(before, command);
      }
      await whenEngineQuiet();
      return null;
    });
    if (refused) {
      this.desync(`catch-up ${refused.type} refused here`);
      return;
    }
    const now = stateChecksum(game);
    if (expected && now !== expected) {
      console.warn(`[Lockstep] resync led to ${now}, ${expected} there`);
      this.options.onDesync?.(`resync led to ${now}, ${expected} there`);
      return;
    }
    this.options.onResynced?.();
  }

  private async restore(state: LockstepState): Promise<void> {
    await whenEngineQuiet();
    const { game } = this.options;
    if (
      game.isSuspended() &&
      state.applied + state.replay.length === this.applied &&
      state.checksum === stateChecksum(game)
    ) {
      this.awaitingResync = false;
      this.awaitingCatchUp = false;
      this.options.onResynced?.();
      return;
    }
    restoreEngine(game, state);
    this.resetAppliedState(state.applied);
    await this.runMissed(state.replay, state.checksum);
  }

  private resetAppliedState(applied: number): void {
    this.applied = applied;
    this.log = [];
    this.logFrom = applied;
    this.atRest = null;
    this.awaitingResync = false;
    this.awaitingCatchUp = false;
  }

  private aboutToRun(): string {
    const { game } = this.options;
    if (game.isAtRest()) this.atRest = structuredClone(this.captureState());
    return stateChecksum(game);
  }

  private record(before: string, command: HeadlessCommand): void {
    this.log.push({ before, command });
    this.applied++;
  }

  private enqueue<T>(work: () => Promise<T>): Promise<T> {
    const next = this.queue.then(work, work);
    this.queue = next.catch(() => undefined);
    return next;
  }

  private async send(
    partial: EnvelopeBody
  ): Promise<void> {
    await this.options.transport.send({
      ...partial,
      ...this.seq.stamp(),
      from: this.options.selfId,
    });
  }
}
