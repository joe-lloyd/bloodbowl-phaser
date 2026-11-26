import {
  createHeadlessGame,
  type HeadlessGameOptions,
  type HeadlessGameContext,
} from "./createHeadlessGame";
import {
  type HeadlessCommand,
  type CommandResponse,
  type PendingDecision,
  type EmittedEvent,
  DECISION_REPLIES,
} from "./protocol";
import {
  serializeGameState,
  type GameSnapshot,
  type MatchSave,
  createMatchSave,
} from "./serialization";
import { type CommandHost, dispatchCommand } from "./commandHandlers";
import { validateShape } from "./commandShape";
import { currentCommand } from "./legacyCommand";
import { enumerateLegalActions } from "./legalActions";
import { engineDecision, requestedDecision } from "./pendingDecisions";
import { GameEventNames } from "../types/events";
import { GamePhase } from "../types/GameState";
import { type Player } from "../types/Player";

export const tick: () => Promise<void> =
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

const RESTORABLE_PENDING: ReadonlySet<PendingDecision["type"]> = new Set([
  "kickoff-event",
  "touchback",
]);

export interface GameFork {
  save: MatchSave;
  since: HeadlessCommand[];
}

export class HeadlessGame {
  public readonly ctx: HeadlessGameContext;
  private eventLog: EmittedEvent[] = [];
  private pending: PendingDecision | null = null;

  private heldFollowUp: PendingDecision | null = null;

  private inFlight: Promise<void> | null = null;
  private decisionWaiters: (() => void)[] = [];

  private readonly firstKickingTeamId: string | null;

  private readonly autoStartOnReady: boolean;
  private readonly lazySnapshots: boolean;

  private forkBase: GameFork | null = null;
  private keepingForks = false;

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
      logEvent: (event) => {
        this.eventLog.push(event);
      },
    };
    this.autoStartOnReady = options.autoStartOnReady !== false;
    this.lazySnapshots = options.lazySnapshots === true;
    this.firstKickingTeamId =
      options.matchSave?.drive.kickingTeamId ?? options.kickingTeamId ?? null;
    this.subscribeToAllEvents();

    const restoredApothecary =
      this.ctx.gameService.getState().inducements?.pendingApothecaryDecision;
    if (restoredApothecary) {
      this.pending = restoredApothecary;
    }
    this.surfaceKickPending();
    this.resumeKick();
  }

  private resumeKick(): void {
    this.ctx.gameService.resumeKick().catch((error: unknown) => {
      console.error("[Headless] the resumed kick failed:", error);
    });
  }

  public snapshot(): GameSnapshot {
    const snapshot = serializeGameState(this.ctx.gameService.getState(), [
      this.ctx.team1,
      this.ctx.team2,
    ]);

    snapshot.turnManager = this.ctx.gameService.captureTurnManagerState();
    return snapshot;
  }

  public pendingDecision(): PendingDecision | null {
    return this.pending;
  }

  public matchSave(): MatchSave {
    const gs = this.ctx.gameService;
    const { team1, team2 } = this.ctx;
    const turnManager = gs.captureTurnManagerState();
    const state = gs.getState();
    const kickingTeamId = this.driveKickingTeamId() ?? team1.id;
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

  public keepForks(): void {
    this.keepingForks = true;
  }

  public fork(): GameFork | null {
    return this.forkBase
      ? { save: this.forkBase.save, since: [...this.forkBase.since] }
      : null;
  }

  private noteForFork(cmd: HeadlessCommand): void {
    if (!this.keepingForks) return;
    const state = this.ctx.gameService.getState();
    if (!this.pending && !this.inFlight && !this.ctx.gameService.kickInTheAir()) {
      if (state.phase !== GamePhase.PLAY) this.forkBase = null;
      else if (!state.activePlayer)
        this.forkBase = { save: this.matchSave(), since: [] };
    }
    this.forkBase?.since.push(cmd);
  }

  public driveKickingTeamId(): string | null {
    const { gameService } = this.ctx;
    const { kick, phase, setup } = gameService.getState();
    const settingUp = phase === GamePhase.SETUP || phase === GamePhase.KICKOFF;
    return (
      kick?.kickingTeamId ??
      (settingUp ? setup?.kickingTeamId : null) ??
      gameService.captureTurnManagerState().driveKickingTeamId ??
      this.firstKickingTeamId
    );
  }

  public adoptPending(pending: PendingDecision | null): void {
    this.ctx.gameService.getDecisionService().abandon();

    this.ctx.gameService.flowManager.abandon();
    this.inFlight = null;
    this.ctx.gameService.abandonKick();
    this.pending = pending;
    this.surfaceKickPending();
    this.resumeKick();
  }

  public isSuspended(): boolean {
    return (
      this.inFlight !== null ||
      this.ctx.gameService.kickInTheAir() !== null ||
      this.ctx.gameService.getDecisionService().pending() !== null
    );
  }

  public isAtRest(): boolean {
    const { gameService } = this.ctx;
    return (
      this.inFlight === null &&
      !gameService.captureTurnManagerState().turnoverInProgress &&
      (this.pending === null || RESTORABLE_PENDING.has(this.pending.type)) &&
      gameService.getDecisionService().pending() === null &&
      (gameService.kickInTheAir() === null ||
        gameService.getKickoffEventStep() !== null)
    );
  }

  public events(): EmittedEvent[] {
    return [...this.eventLog];
  }

  public async execute(command: unknown): Promise<CommandResponse> {
    const shapeError = validateShape(command);
    if (shapeError) return this.reject(shapeError);

    const cmd = currentCommand(command as HeadlessCommand);

    if (cmd.type === "state") {
      return this.respond(true);
    }
    if (cmd.type === "legal-actions") {
      const response = this.respond(true);
      response.legalActions = enumerateLegalActions({
        ctx: this.ctx,
        pending: this.pending,
        ...(cmd.playerId === undefined ? {} : { focusPlayerId: cmd.playerId }),
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

    const prior = this.inFlight;
    this.inFlight = null;
    const run = (async () => {
      await dispatchCommand(this.commandHost, cmd.type, cmd);
      if (prior) await prior;
      await this.kickLanded();
      await this.settle();
      this.surfaceKickoffPending();
    })();

    const outcome = await Promise.race([
      run.then(
        () => ({ kind: "done" as const }),
        (error: unknown) => ({ kind: "error" as const, err: error })
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
      this.suspend(
        run.catch((error: unknown) => {
          console.error("[Headless] suspended command failed:", error);
        })
      );
    } else if (!this.pending && this.heldFollowUp) {
      this.pending = this.heldFollowUp;
      this.heldFollowUp = null;
    }
    return this.respond(true);
  }

  private suspend(work: Promise<void>): void {
    if (this.pending?.type !== "kickoff-event") this.inFlight = work;
  }

  private async kickLanded(): Promise<void> {
    const { gameService } = this.ctx;
    if (gameService.getKickoffEventStep()) await tick();
    if (!gameService.getKickoffEventStep()) await gameService.kickInTheAir();
  }

  private pendingGate(cmd: HeadlessCommand): string | null {
    const pending = this.pending;
    const replyFor = DECISION_REPLIES[cmd.type];
    if (pending?.type === "kickoff-event") {
      return replyFor === "kickoff-event"
        ? null
        : "decision-pending:kickoff-event — resolve it before other commands";
    }
    if (pending && replyFor !== pending.type) {
      return `decision-pending:${pending.type} — resolve it before other commands`;
    }
    return !pending && replyFor ? "no-decision-pending" : null;
  }

  private subscribeToAllEvents(): void {
    Object.values(GameEventNames).forEach((name) => {
      this.ctx.eventBus.on(name as any, (data: any) => {
        this.eventLog.push({ name, data });
        this.interceptDecision(name, data);
      });
    });
  }

  private interceptDecision(name: string, data: any): void {
    switch (name) {
      case GameEventNames.KickoffEventStepStarted:
        this.surfaceKickoffPending();
        this.decisionWaiters.splice(0).forEach((wake) => {
          wake();
        });
        return;
      case GameEventNames.KickoffEventStepResolved:
        if (this.pending?.type === "kickoff-event") this.pending = null;
        return;
      case GameEventNames.ReadyToStart:
        this.startOnReady();
        return;
      case GameEventNames.DecisionRequested: {
        if (this.pending?.type === "follow-up") {
          this.heldFollowUp = this.pending;
        }

        const requested = requestedDecision(data);
        if (!requested) return;
        this.pending = requested;
        this.decisionWaiters.splice(0).forEach((wake) => {
          wake();
        });
        return;
      }
    }
    const decision = engineDecision(name, data, (id) => this.findPlayer(id));
    if (decision) this.pending = decision;
  }

  private startOnReady(): void {
    const kickingTeamId = this.driveKickingTeamId();
    if (this.autoStartOnReady && kickingTeamId)
      this.ctx.gameService.startGame(kickingTeamId);
  }

  private surfaceKickPending(): void {
    this.surfaceKickoffPending();
    const teamId = this.ctx.gameService.getState().kick?.touchbackTeamId;
    if (!this.pending && teamId) this.pending = { type: "touchback", teamId };
  }

  private surfaceKickoffPending(): void {
    if (this.pending && this.pending.type !== "kickoff-event") return;
    const step = this.ctx.gameService.getKickoffEventStep();
    if (step?.stage !== "choose") {
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
      ...(step.landingSquare ? { landingSquare: { ...step.landingSquare } } : {}),
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

  private findPlayer(playerId: string): Player | undefined {
    return this.ctx.gameService.getPlayerById(playerId);
  }

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

    const snapshot = () => this.snapshot();
    return {
      ...base,
      get snapshot() {
        return snapshot();
      },
    };
  }

  private reject(reason: string): CommandResponse {
    return {
      ok: false,
      reason,
      events: [],
      snapshot: this.snapshot(),
      pendingDecision: this.pending,
    };
  }
}
