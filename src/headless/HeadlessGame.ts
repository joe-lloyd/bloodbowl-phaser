/**
 * HeadlessGame - Plays the engine over the JSON action protocol.
 *
 * Thin adapter: dispatches commands to IGameService, records every EventBus
 * event emitted during execution, and surfaces mid-action choices (block die,
 * push direction, follow-up) as pendingDecision instead of UI dialogs.
 */

import {
  createHeadlessGame,
  HeadlessGameOptions,
  HeadlessGameContext,
} from "./createHeadlessGame";
import {
  HeadlessCommand,
  CommandResponse,
  PendingDecision,
  EmittedEvent,
  DECISION_REPLIES,
} from "./protocol";
import {
  serializeGameState,
  GameSnapshot,
  MatchSave,
  createMatchSave,
} from "./serialization";
import { CommandHost, dispatchCommand } from "./commandHandlers";
import { validateShape } from "./commandShape";
import { enumerateLegalActions } from "./legalActions";
import { engineDecision, requestedDecision } from "./pendingDecisions";
import { GameEventNames } from "../types/events";
import { GamePhase } from "../types/GameState";
import { Player } from "../types/Player";

const CHARGE_COMMANDS = new Set<HeadlessCommand["type"]>([
  "declare-action",
  "move",
  "block",
  "throw-teammate",
  "end-activation",
]);

/**
 * One macrotask. setImmediate in Node; a message in a page or Web Worker,
 * where setTimeout(0) is clamped to about 4 ms and a lookahead's thousands
 * of commands would crawl.
 */
const tick: () => Promise<void> =
  typeof setImmediate === "function"
    ? () => new Promise((resolve) => setImmediate(resolve))
    : typeof MessageChannel === "function"
      ? () =>
          new Promise((resolve) => {
            const { port1, port2 } = new MessageChannel();
            port1.onmessage = () => {
              port1.close();
              resolve();
            };
            port2.postMessage(null);
          })
      : () => new Promise((resolve) => setTimeout(resolve, 0));

/**
 * A way back to a position no save can hold: a choice inside an action,
 * where a command is paused. The engine is deterministic, so replaying
 * `since` on a game restored from `save` reaches it, dice and all.
 */
export interface GameFork {
  save: MatchSave;
  since: HeadlessCommand[];
}

export class HeadlessGame {
  public readonly ctx: HeadlessGameContext;
  private eventLog: EmittedEvent[] = [];
  private pending: PendingDecision | null = null;
  /**
   * A follow-up another decision displaced: a push's bounce can raise a catch
   * re-roll before the attacker answers. It comes back once that one is done.
   */
  private heldFollowUp: PendingDecision | null = null;
  /**
   * A command suspended mid-execution on an awaitable decision (reroll):
   * its promise parks here while the response goes out with the pending
   * decision; the reply command resumes it and awaits its completion.
   */
  private inFlight: Promise<void> | null = null;
  private decisionWaiters: (() => void)[] = [];
  /** Kicking team of the current drive; set by coin-flip/start-setup/kick-ball */
  private kickingTeamId: string | null = null;

  private readonly autoStartOnReady: boolean;
  private readonly lazySnapshots: boolean;
  /** Set once a coach asks: the last save between activations, and since. */
  private forkBase: GameFork | null = null;
  private keepingForks = false;
  /** What the command handlers may touch here. */
  private readonly commandHost: CommandHost;

  constructor(options: HeadlessGameOptions = {}) {
    this.ctx = createHeadlessGame(options);
    this.commandHost = {
      ctx: this.ctx,
      takePending: (type) => this.takePending(type),
      restorePending: (pending) => {
        this.pending = pending;
      },
      dropHeldFollowUp: () => {
        this.heldFollowUp = null;
      },
      setKickingTeam: (teamId) => {
        this.kickingTeamId = teamId;
      },
      logEvent: (event) => {
        this.eventLog.push(event);
      },
    };
    this.autoStartOnReady = options.autoStartOnReady !== false;
    this.lazySnapshots = options.lazySnapshots === true;
    this.kickingTeamId =
      options.matchSave?.drive.kickingTeamId ?? options.kickingTeamId ?? null;
    this.subscribeToAllEvents();

    // A restored save mid-Apothecary-decision has already re-armed the
    // engine's DecisionService (see GameService's constructor); mirror the
    // same pending state into the protocol surface so a query right after
    // construction sees it without needing a fresh DecisionRequested event.
    const restoredApothecary =
      this.ctx.gameService.getState().inducements?.pendingApothecaryDecision;
    if (restoredApothecary) {
      this.pending = restoredApothecary;
    }
  }

  // ===== Public API =====

  public snapshot(): GameSnapshot {
    const snapshot = serializeGameState(this.ctx.gameService.getState(), [
      this.ctx.team1,
      this.ctx.team2,
    ]);
    // Sidecar field: per-team turn counters live on TurnManager, not
    // GameState, so serializeGameState can't see them — attach here for
    // the network layer (see GameSnapshot.turnManager).
    snapshot.turnManager = this.ctx.gameService.captureTurnManagerState();
    return snapshot;
  }

  public pendingDecision(): PendingDecision | null {
    return this.pending;
  }

  /** A save of the match as it stands, for a settled engine. */
  public matchSave(): MatchSave {
    const gs = this.ctx.gameService;
    const { team1, team2 } = this.ctx;
    const turnManager = gs.captureTurnManagerState();
    const state = gs.getState();
    // The turn manager learns a drive's kicker when play starts; until then,
    // set-up holds the coming drive's.
    const settingUp =
      state.phase === GamePhase.SETUP || state.phase === GamePhase.KICKOFF;
    const kickingTeamId =
      (settingUp ? state.setup?.kickingTeamId : null) ??
      turnManager.driveKickingTeamId ??
      this.kickingTeamId ??
      team1.id;
    return createMatchSave({
      state,
      teams: [team1, team2],
      drive: {
        kickingTeamId,
        receivingTeamId: kickingTeamId === team1.id ? team2.id : team1.id,
      },
      rng: this.ctx.rng.captureState(),
      matchStats: this.ctx.matchStats.captureState(),
      turnManager,
    });
  }

  /**
   * Start keeping a fork: from the next quiet moment between activations,
   * a save of it and every command played since. Off until asked, because
   * a lookahead's thousands of copies never need one.
   */
  public keepForks(): void {
    this.keepingForks = true;
  }

  /** The way back to the position now, or null if none is kept yet. */
  public fork(): GameFork | null {
    return this.forkBase
      ? { save: this.forkBase.save, since: [...this.forkBase.since] }
      : null;
  }

  /**
   * Between activations in open play, with nothing pending, a save holds
   * everything; inside an action it cannot, so the commands are kept.
   */
  private noteForFork(cmd: HeadlessCommand): void {
    if (!this.keepingForks) return;
    const state = this.ctx.gameService.getState();
    if (!this.pending && !this.inFlight) {
      if (state.phase !== GamePhase.PLAY) this.forkBase = null;
      else if (!state.activePlayer)
        this.forkBase = { save: this.matchSave(), since: [] };
    }
    this.forkBase?.since.push(cmd);
  }

  /** Who kicks this drive, once the toss has settled it. */
  public driveKickingTeamId(): string | null {
    return this.kickingTeamId;
  }

  /**
   * Take on another engine's state wholesale (an online resync): drop any
   * decision this engine was paused on and show the other's instead.
   */
  public adoptPending(pending: PendingDecision | null): void {
    this.ctx.gameService.getDecisionService().abandon();
    // The run paused on it never resumes, so nothing may wait for it
    this.ctx.gameService.flowManager.abandon();
    this.inFlight = null;
    this.pending = pending;
  }

  /** A command's run is parked on a decision, which no state can carry. */
  public isSuspended(): boolean {
    return (
      this.inFlight !== null ||
      this.ctx.gameService.getDecisionService().pending() !== null
    );
  }

  /**
   * Every event seen since the last command, in emission order. `execute()`
   * clears this per command; a passive observer (the browser test bridge)
   * never calls execute, so for it this is the whole match log.
   */
  public events(): EmittedEvent[] {
    return [...this.eventLog];
  }

  public async execute(command: unknown): Promise<CommandResponse> {
    const shapeError = validateShape(command);
    if (shapeError) return this.reject(shapeError);

    const cmd = command as HeadlessCommand;

    // Queries never mutate and are always allowed
    if (cmd.type === "state") {
      return this.respond(true);
    }
    if (cmd.type === "legal-actions") {
      const response = this.respond(true);
      response.legalActions = enumerateLegalActions({
        ctx: this.ctx,
        pending: this.pending,
        focusPlayerId: cmd.playerId,
      });
      return response;
    }
    if (cmd.type === "offer-inducements") {
      const response = this.respond(true);
      response.inducementOffer = this.ctx.gameService.getInducementOffer();
      return response;
    }

    const gateError = this.pendingGate(cmd);
    if (gateError) return this.reject(gateError);
    this.noteForFork(cmd);

    this.eventLog = [];
    this.decisionWaiters = [];
    const raised = new Promise<void>((resolve) =>
      this.decisionWaiters.push(resolve)
    );

    // A command may suspend mid-execution on an awaitable decision (a
    // reroll offer inside a move, a flow operation pausing). Race the run
    // against "a decision was raised": on suspension, respond now with the
    // pending decision and park the run; the reply command resumes it.
    const prior = this.inFlight;
    this.inFlight = null;
    const run = (async () => {
      await dispatchCommand(this.commandHost, cmd.type, cmd);
      if (prior) {
        if (this.ctx.gameService.getKickoffEventStep()) {
          this.inFlight ??= prior;
          this.surfaceKickoffPending();
        } else {
          await prior;
        }
      }
      await this.settle();
      this.surfaceKickoffPending();
    })();

    const outcome = await Promise.race([
      run.then(
        () => ({ kind: "done" as const }),
        (err: unknown) => ({ kind: "error" as const, err })
      ),
      raised.then(() => ({ kind: "decision" as const })),
    ]);

    if (outcome.kind === "error") {
      return this.reject(
        `command-failed: ${
          outcome.err instanceof Error
            ? outcome.err.message
            : String(outcome.err)
        }`
      );
    }
    if (outcome.kind === "decision") {
      this.inFlight = run.catch((err) =>
        console.error("[Headless] suspended command failed:", err)
      );
    } else if (!this.pending && this.heldFollowUp) {
      this.pending = this.heldFollowUp;
      this.heldFollowUp = null;
    }
    return this.respond(true);
  }

  /** Gate: while a decision is pending, only its reply is accepted. */
  private pendingGate(cmd: HeadlessCommand): string | null {
    const pending = this.pending;
    const replyFor = DECISION_REPLIES[cmd.type];
    if (pending?.type === "kickoff-event") {
      const chargeCommand = !!pending.charge && CHARGE_COMMANDS.has(cmd.type);
      return replyFor !== "kickoff-event" && !chargeCommand
        ? "decision-pending:kickoff-event — resolve it before other commands"
        : null;
    }
    if (pending && replyFor !== pending.type) {
      return `decision-pending:${pending.type} — resolve it before other commands`;
    }
    return !pending && replyFor ? "no-decision-pending" : null;
  }

  // ===== Decision interception =====

  private subscribeToAllEvents(): void {
    Object.values(GameEventNames).forEach((name) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      this.ctx.eventBus.on(name as any, (data: any) => {
        this.eventLog.push({ name, data });
        this.interceptDecision(name, data);
      });
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private interceptDecision(name: string, data: any): void {
    switch (name) {
      case GameEventNames.KickoffEventStepStarted:
        this.surfaceKickoffPending();
        this.decisionWaiters.splice(0).forEach((wake) => wake());
        return;
      case GameEventNames.KickoffEventStepResolved:
        if (this.pending?.type === "kickoff-event") this.pending = null;
        return;
      case GameEventNames.ReadyToStart:
        // In the browser KickoffPhaseHandler starts play on this signal;
        // headless mirrors that so the kickoff chain flows into PLAY.
        if (this.autoStartOnReady && this.kickingTeamId) {
          this.ctx.gameService.startGame(this.kickingTeamId);
        }
        return;
      case GameEventNames.DecisionRequested: {
        if (this.pending?.type === "follow-up") {
          this.heldFollowUp = this.pending;
        }
        // Awaitable decision: the engine is paused on this promise. Surface
        // it and wake execute()'s race so the response goes out now.
        const requested = requestedDecision(data);
        if (!requested) return;
        this.pending = requested;
        this.decisionWaiters.splice(0).forEach((wake) => wake());
        return;
      }
    }
    const decision = engineDecision(name, data, (id) => this.findPlayer(id));
    if (decision) this.pending = decision;
  }

  /** Mirror the engine-owned kickoff step into the protocol decision shape. */
  private surfaceKickoffPending(): void {
    if (this.pending && this.pending.type !== "kickoff-event") return;
    const step = this.ctx.gameService.getKickoffEventStep();
    if (!step) {
      if (this.pending?.type === "kickoff-event") this.pending = null;
      return;
    }
    this.pending = {
      type: "kickoff-event",
      chooserTeamId: step.teamId,
      event: step.event,
      selectionLimit: step.selectionLimit,
      selectedPlayerIds: [...step.selectedPlayerIds],
      movedPlayerIds: [...step.movedPlayerIds],
      awaitingPlacement: [...step.awaitingPlacement],
      landingSquare: step.landingSquare ? { ...step.landingSquare } : undefined,
      charge: step.charge
        ? {
            queue: [...step.charge.queue],
            budget: { ...step.charge.budget },
            activePlayerId: step.charge.activePlayerId,
            aborted: step.charge.aborted,
          }
        : undefined,
    };
  }

  private takePending<T extends PendingDecision["type"]>(
    type: T
  ): Extract<PendingDecision, { type: T }> {
    if (!this.pending || this.pending.type !== type) {
      throw new Error(`no-pending-${type}`);
    }
    const pending = this.pending as Extract<PendingDecision, { type: T }>;
    this.pending = null;
    return pending;
  }

  // ===== Helpers =====

  private findPlayer(playerId: string): Player | undefined {
    return this.ctx.gameService.getPlayerById(playerId);
  }

  /**
   * Let fire-and-forget engine chains (noDelay .then sequencing, the flow
   * queue) fully settle before reporting the outcome. They are promise
   * chains, so one macrotask drains them all; more ticks only add a turn of
   * the event loop to every command, which a lookahead runs millions of.
   */
  private async settle(): Promise<void> {
    await tick();
  }

  private respond(ok: boolean, reason?: string): CommandResponse {
    const base = {
      ok,
      ...(reason ? { reason } : {}),
      events: [...this.eventLog],
      pendingDecision: this.pending,
    };
    if (!this.lazySnapshots) return { ...base, snapshot: this.snapshot() };
    // A throwaway copy of the game reads its state directly, if at all.
    const snapshot = () => this.snapshot();
    return {
      ...base,
      get snapshot() {
        return snapshot();
      },
    };
  }

  private reject(reason: string): CommandResponse {
    // Rejections report no events: the command was not executed
    return {
      ok: false,
      reason,
      events: [],
      snapshot: this.snapshot(),
      pendingDecision: this.pending,
    };
  }
}
