/**
 * LockstepSession - one side of an online match where both browsers run
 * the full engine.
 *
 * The coach who may act runs each command on their own engine at once, then
 * sends only the command with a checksum of the state before and after. The
 * other side runs the same command and compares. Engines that start from the
 * same state and seed and run the same commands stay identical (see
 * __tests__/simulation/lockstep-determinism.test.ts), so the only things
 * that cross the wire during play are commands. A mismatch asks for the
 * full state, which travels only then and on (re)joining.
 */

import { HeadlessGame } from "../headless/HeadlessGame";
import { CommandResponse, HeadlessCommand } from "../headless/protocol";
import { stateChecksum } from "../headless/checksum";
import { whenEngineQuiet, withoutPacing } from "../game/core/GameFlowManager";
import {
  applySnapshotToTeams,
  deserializeGameState,
  restoreTeam,
} from "../headless/serialization";
import {
  CatchUpPayload,
  ChatPayload,
  Envelope,
  HelloPayload,
  LockstepState,
  PROTOCOL_VERSION,
  SelectionPayload,
  PromptPayload,
  SequenceTracker,
  SettledPayload,
} from "./envelope";
import { Transport } from "./transport";
import { StepPrompt } from "../types/events";
import { checkOwnership, GateContext } from "./OwnershipGate";

export interface LockstepSessionOptions {
  transport: Transport;
  game: HeadlessGame;
  /** Sender id stamped on outgoing envelopes (the coach's uid) */
  selfId: string;
  myTeamId: string;
  peerTeamId: string;
  hostTeamId: string;
  /** Commands applied before this session started (a resumed save). */
  appliedCommands?: number;
  onHello?: (payload: HelloPayload, from: string) => void;
  onChat?: (payload: ChatPayload, from: string) => void;
  onSelection?: (payload: SelectionPayload, from: string) => void;
  onPrompt?: (payload: PromptPayload, from: string) => void;
  /** The other coach's command is about to run on this engine. */
  onPeerCommand?: (command: HeadlessCommand) => void;
  /** After any command ran on this engine, this coach's or the other's. */
  onApplied?: (command: HeadlessCommand, own: boolean) => void;
  /** The engine was rebuilt from the other side's full state. */
  onResynced?: () => void;
  /** A command after which the two engines disagreed. */
  onDesync?: (detail: string) => void;
}

export class LockstepSession {
  private readonly seq = new SequenceTracker();
  private readonly unsubscribe: () => void;
  /** Local and peer commands never interleave on the engine. */
  private queue: Promise<unknown> = Promise.resolve();
  /** Commands this engine has run since the match began. */
  private applied: number;
  /** Set after a mismatch: peer commands wait for the resync. */
  private awaitingResync = false;
  /**
   * Set by this page's hello: what the other side sends next already holds
   * any command that arrives before it.
   */
  private awaitingCatchUp = false;
  /**
   * Every command run here since `logFrom` commands, with the state's
   * checksum before it, so a page that comes back behind can replay them.
   */
  private log: { before: string; command: HeadlessCommand }[] = [];
  private logFrom: number;
  /** The latest state with no roll path paused, for a resync to start from. */
  private atRest: LockstepState | null = null;

  constructor(private readonly options: LockstepSessionOptions) {
    this.applied = options.appliedCommands ?? 0;
    this.logFrom = this.applied;
    this.unsubscribe = options.transport.subscribe((envelope) =>
      this.receive(envelope)
    );
  }

  /** Resolves once every queued command has run. */
  async whenIdle(): Promise<void> {
    let seen: Promise<unknown>;
    do {
      seen = this.queue;
      await seen;
    } while (seen !== this.queue);
  }

  /** Commands this engine has run since the match began. */
  appliedCommands(): number {
    return this.applied;
  }

  /**
   * Send one of this coach's commands, then run it here. Refused locally,
   * without sending, when it is not this coach's to make.
   *
   * The command goes out before this engine runs it. Running it plays out
   * this screen's dice, falls and banners, which can take seconds; sending
   * after that left the other coach watching the same thing up to 10 s late.
   * Both engines run it from the same state, so a refusal here is the same
   * refusal there, and neither side counts it. Once the flow here has
   * played out, a settled envelope carries the checksum it led to.
   */
  run(command: HeadlessCommand): Promise<CommandResponse> {
    return this.enqueue(async () => {
      const { game } = this.options;
      // Check once this screen has played out what came before: a turnover
      // still playing can end the turn the click was meant for
      await whenEngineQuiet();
      const verdict = checkOwnership(
        command,
        this.options.myTeamId,
        this.gateContext()
      );
      if (!verdict.allowed) return this.rejection(verdict.reason);
      // Stamped now, so it is ordered before anything this side sends later
      const before = this.aboutToRun();
      void this.send({ kind: "command", payload: { command, before } });
      const response = await game.execute(command);
      if (!response.ok) return response;
      this.record(before, command);
      this.options.onApplied?.(command, true);
      // The state after the command's own paced flow, which is what the
      // other engine will also reach
      await whenEngineQuiet();
      void this.send({
        kind: "settled",
        payload: { applied: this.applied, checksum: stateChecksum(game) },
      });
      return response;
    });
  }

  async sendHello(): Promise<void> {
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

  /** Broadcast this coach's current selection (cosmetic; fire-and-forget). */
  async sendSelection(playerId: string | null): Promise<void> {
    await this.send({ kind: "selection", payload: { playerId } });
  }

  /** Broadcast the step prompt this coach has open (cosmetic). */
  async sendPrompt(prompt: StepPrompt | null): Promise<void> {
    await this.send({ kind: "prompt", payload: { prompt } });
  }

  async requestResync(): Promise<void> {
    if (this.awaitingResync) return;
    this.awaitingResync = true;
    await this.send({ kind: "resync-request", payload: {} });
  }

  /** The full state, for a peer that is behind or has diverged. */
  captureState(): LockstepState {
    const { game } = this.options;
    if (game.isSuspended() && this.atRest) {
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
      teams: [game.ctx.team1, game.ctx.team2],
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

  // ===== Incoming =====

  private receive(envelope: Envelope): void {
    // A hello opens a new page on the other side, whose seq starts at 1.
    // Whichever side has run more commands holds the newer state and sends
    // it: a reloaded page resumes from its last save, which may be behind.
    if (envelope.kind === "hello") {
      this.seq.acceptFrom(envelope.from, envelope.seq);
      this.options.onHello?.(envelope.payload, envelope.from);
      // A page on another version speaks shapes this engine cannot read
      if (envelope.payload.protocolVersion !== PROTOCOL_VERSION) {
        this.close();
        return;
      }
      const { applied, checksum } = envelope.payload;
      // The other page is new, so this side answers for both
      this.awaitingCatchUp = false;
      void this.enqueue(async () => {
        if (this.applied < applied) await this.requestResync();
        else await this.sendCatchUp(applied, checksum);
      });
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

    switch (envelope.kind) {
      case "command": {
        const { command, before } = envelope.payload;
        void this.enqueue(() => this.applyPeerCommand(command, before));
        break;
      }
      case "settled": {
        const settled = envelope.payload;
        void this.enqueue(() => this.checkSettled(settled));
        break;
      }
      case "resync-request":
        void this.enqueue(() => this.sendResync());
        break;
      case "chat":
        this.options.onChat?.(envelope.payload, envelope.from);
        break;
      case "selection":
        this.options.onSelection?.(envelope.payload, envelope.from);
        break;
      case "prompt":
        this.options.onPrompt?.(envelope.payload, envelope.from);
        break;
      case "heartbeat":
        break;
    }
  }

  private async applyPeerCommand(
    command: HeadlessCommand,
    before: string
  ): Promise<void> {
    // The resync or catch-up replaces it
    if (this.awaitingResync || this.awaitingCatchUp) return;
    const { game } = this.options;
    // This engine may still be playing out the previous command's paced
    // flow (a turnover, the half-time sequence); let it finish first
    await whenEngineQuiet();
    const mine = this.aboutToRun();
    if (mine !== before) {
      this.desync(`before ${command.type}: ${mine} here, ${before} there`);
      return;
    }
    const verdict = checkOwnership(
      command,
      this.options.peerTeamId,
      this.gateContext()
    );
    if (!verdict.allowed) {
      this.desync(`${command.type} refused here: ${verdict.reason}`);
      return;
    }
    this.options.onPeerCommand?.(command);
    const response = await game.execute(command);
    // The sender ran it from the same state, so it was refused there too
    // and was not counted. If it was not, its settled count says so and
    // asks for a resync; the reason is logged here so the cause is known.
    if (!response.ok) {
      console.warn(
        `[Lockstep] peer ${command.type} refused here: ${response.reason ?? "no reason"}`
      );
      return;
    }
    this.record(mine, command);
    this.options.onApplied?.(command, false);
  }

  /**
   * The other engine has played out its command. Compare once this one has
   * too. A count above theirs means this coach has acted since, and that
   * command's own checksum does the comparing.
   */
  private async checkSettled({
    applied,
    checksum,
  }: SettledPayload): Promise<void> {
    if (this.awaitingResync || this.awaitingCatchUp) return;
    await whenEngineQuiet();
    if (this.applied < applied) {
      this.desync(`ran ${this.applied} commands here, ${applied} there`);
      return;
    }
    if (this.applied > applied) return;
    const now = stateChecksum(this.options.game);
    if (now !== checksum) {
      this.desync(`after command ${applied}: ${now} here, ${checksum} there`);
    }
  }

  private desync(detail: string): void {
    console.warn(`[Lockstep] desync ${detail}`);
    // With network tracing on, show what this side holds, to compare
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
      // no storage in tests
    }
    this.options.onDesync?.(detail);
    void this.requestResync();
  }

  private async sendResync(): Promise<void> {
    // Never send a state caught halfway through a paced chain
    await whenEngineQuiet();
    // This side's state wins, so nothing is coming that holds the next command
    this.awaitingCatchUp = false;
    await this.send({ kind: "resync", payload: this.captureState() });
  }

  /**
   * A page that came back at `from` commands: send what it missed when this
   * side ran it from the same state, or the full state when not.
   */
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

  /** Run the commands this page missed, as the other engine ran them. */
  private async replay({ from, commands }: CatchUpPayload): Promise<void> {
    await whenEngineQuiet();
    // Both pages opened together and each answered the other's hello: this
    // side already answered for both, so the other's answer is not needed
    if (!this.awaitingCatchUp) return;
    this.awaitingCatchUp = false;
    if (this.applied !== from) {
      this.desync(`catch-up from ${from}, ${this.applied} run here`);
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
      // The next command's checksum asks again, at most once per command
      console.warn(`[Lockstep] resync led to ${now}, ${expected} there`);
      this.options.onDesync?.(`resync led to ${now}, ${expected} there`);
      return;
    }
    this.options.onResynced?.();
  }

  /** Rebuild this engine from the other side's full state. */
  private async restore(state: LockstepState): Promise<void> {
    // A chain still pacing here would fire after the restore and undo it
    await whenEngineQuiet();
    const { game } = this.options;
    if (
      state.applied + state.replay.length === this.applied &&
      state.checksum === stateChecksum(game)
    ) {
      // Rebuilding would throw away a paused roll path that is still good
      this.awaitingResync = false;
      this.awaitingCatchUp = false;
      this.options.onResynced?.();
      return;
    }
    const { team1, team2, gameService, rng, matchStats } = game.ctx;
    // Copy into the existing objects: the board holds references to them
    [team1, team2].forEach((team, index) => {
      restoreTeam(team, state.teams[index]);
    });
    applySnapshotToTeams(state.snapshot, [team1, team2]);
    Object.assign(gameService.getState(), deserializeGameState(state.snapshot));
    if (state.snapshot.turnManager) {
      gameService.restoreTurnManagerState(state.snapshot.turnManager);
    }
    // Setup keeps its own record of placed squares and confirmed teams
    gameService.resyncSetupFromTeams();
    rng.restoreState(state.rng);
    matchStats.restoreState(state.matchStats);
    game.adoptPending(state.pending);
    this.applied = state.applied;
    this.log = [];
    this.logFrom = state.applied;
    this.atRest = null;
    this.awaitingResync = false;
    this.awaitingCatchUp = false;
    await this.runMissed(state.replay, state.checksum);
  }

  // ===== Helpers =====

  /** The checksum a command starts from; keeps the latest state at rest. */
  private aboutToRun(): string {
    const { game } = this.options;
    if (!game.isSuspended()) this.atRest = structuredClone(this.captureState());
    return stateChecksum(game);
  }

  private record(before: string, command: HeadlessCommand): void {
    this.log.push({ before, command });
    this.applied++;
  }

  private gateContext(): GateContext {
    const { game } = this.options;
    const gameService = game.ctx.gameService;
    return {
      activeTeamId: gameService.getState().activeTeamId,
      pendingDecision: game.pendingDecision(),
      teamIdOfPlayer: (playerId) => gameService.getPlayerById(playerId)?.teamId,
      hostTeamId: this.options.hostTeamId,
      phase: gameService.getState().phase,
    };
  }

  private rejection(reason: string): CommandResponse {
    const { game } = this.options;
    return {
      ok: false,
      reason,
      events: [],
      snapshot: game.snapshot(),
      pendingDecision: game.pendingDecision(),
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
      ...this.seq.stamp(),
      from: this.options.selfId,
    } as Envelope);
  }
}
