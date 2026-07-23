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
  LegalActions,
  PlayerActions,
  GridPosition,
} from "./protocol";
import { serializeGameState, GameSnapshot } from "./serialization";
import { GameEventNames, ActionType } from "../types/events";
import { GamePhase } from "../types/GameState";
import { Player, PlayerStatus } from "../types/Player";
import { BlockValidator } from "../game/validators/BlockValidator";

/** Field requirements per command type, used for malformed-command rejection. */
const COMMAND_SHAPES: Record<
  string,
  Record<string, "string" | "number" | "boolean" | "path" | "string-array">
> = {
  "coin-flip": {},
  "start-setup": { kickingTeamId: "string" },
  "place-player": { playerId: "string", x: "number", y: "number" },
  "remove-player": { playerId: "string" },
  "swap-players": { player1Id: "string", player2Id: "string" },
  "confirm-setup": { teamId: "string" },
  "select-kicker": { playerId: "string" },
  "kick-ball": { playerId: "string", x: "number", y: "number" },
  "declare-action": { playerId: "string", action: "string" },
  move: { playerId: "string", path: "path" },
  fumblerooski: { playerId: "string", x: "number", y: "number" },
  jump: { playerId: "string", x: "number", y: "number" },
  "stand-up": { playerId: "string" },
  block: { attackerId: "string", defenderId: "string" },
  "multiple-block": {
    attackerId: "string",
    defender1Id: "string",
    defender2Id: "string",
  },
  pass: { playerId: "string", x: "number", y: "number" },
  punt: { playerId: "string", x: "number", y: "number" },
  handoff: { playerId: "string", x: "number", y: "number" },
  foul: { playerId: "string", x: "number", y: "number" },
  stab: { attackerId: "string", defenderId: "string" },
  "throw-teammate": {
    throwerId: "string",
    teammateId: "string",
    x: "number",
    y: "number",
  },
  "throw-bomb": { throwerId: "string", x: "number", y: "number" },
  "ball-and-chain": { playerId: "string", x: "number", y: "number" },
  "team-reroll-block": { attackerId: "string" },
  "pro-reroll-block": { attackerId: "string", dieIndex: "number" },
  "special-action": {
    action: "string",
    attackerId: "string",
    defenderId: "string",
  },
  "end-activation": { playerId: "string" },
  "end-turn": {},
  "award-mvp": { teamId: "string", nominatedPlayerIds: "string-array" },
  "assign-awarded-touchdown": { playerId: "string" },
  "choose-block-result": { index: "number" },
  "choose-push-direction": { x: "number", y: "number" },
  "choose-follow-up": { followUp: "boolean" },
  "use-reroll": { accept: "boolean" },
  "use-reaction": { accept: "boolean" },
  "choose-interception": {},
  touchback: { playerId: "string" },
  state: {},
  "legal-actions": {},
};

const DECISION_REPLIES: Record<string, PendingDecision["type"]> = {
  "choose-block-result": "block-dice",
  "team-reroll-block": "block-dice",
  "pro-reroll-block": "block-dice",
  "choose-push-direction": "push-direction",
  "choose-follow-up": "follow-up",
  "use-reroll": "reroll",
  "use-reaction": "reaction",
  "choose-interception": "interception",
  touchback: "touchback",
};

export class HeadlessGame {
  public readonly ctx: HeadlessGameContext;
  private eventLog: EmittedEvent[] = [];
  private pending: PendingDecision | null = null;
  /**
   * A command suspended mid-execution on an awaitable decision (reroll):
   * its promise parks here while the response goes out with the pending
   * decision; the reply command resumes it and awaits its completion.
   */
  private inFlight: Promise<void> | null = null;
  private decisionWaiters: (() => void)[] = [];
  private blockValidator = new BlockValidator();
  /** Kicking team of the current drive; set by coin-flip/start-setup/kick-ball */
  private kickingTeamId: string | null = null;

  private readonly autoStartOnReady: boolean;

  constructor(options: HeadlessGameOptions = {}) {
    this.ctx = createHeadlessGame(options);
    this.autoStartOnReady = options.autoStartOnReady !== false;
    this.subscribeToAllEvents();
  }

  // ===== Public API =====

  public snapshot(): GameSnapshot {
    return serializeGameState(this.ctx.gameService.getState(), [
      this.ctx.team1,
      this.ctx.team2,
    ]);
  }

  public pendingDecision(): PendingDecision | null {
    return this.pending;
  }

  public async execute(command: unknown): Promise<CommandResponse> {
    const shapeError = this.validateShape(command);
    if (shapeError) return this.reject(shapeError);

    const cmd = command as HeadlessCommand;

    // Queries never mutate and are always allowed
    if (cmd.type === "state") {
      return this.respond(true);
    }
    if (cmd.type === "legal-actions") {
      const response = this.respond(true);
      response.legalActions = this.enumerateLegalActions(cmd.playerId);
      return response;
    }

    // Gate: while a decision is pending, only its reply is accepted
    const replyFor = DECISION_REPLIES[cmd.type];
    if (this.pending && replyFor !== this.pending.type) {
      return this.reject(
        `decision-pending:${this.pending.type} — resolve it before other commands`
      );
    }
    if (!this.pending && replyFor) {
      return this.reject("no-decision-pending");
    }

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
      await this.dispatch(cmd);
      if (prior) await prior; // a resumed suspended command finishes first
      await this.settle();
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
    }
    return this.respond(true);
  }

  // ===== Dispatch =====

  private async dispatch(cmd: HeadlessCommand): Promise<void> {
    const gs = this.ctx.gameService;

    switch (cmd.type) {
      case "coin-flip": {
        // Coin flip lives UI-side in the browser; headless resolves it with
        // the seeded RNG so it stays deterministic and replayable.
        if (!gs.canCoinFlip()) {
          throw new Error("coin-flip-only-before-first-drive");
        }
        const roll = this.ctx.rng.rollDie(2);
        const kickingTeam = roll === 1 ? this.ctx.team1 : this.ctx.team2;
        this.eventLog.push({
          name: "headless:coinFlip",
          data: { kickingTeamId: kickingTeam.id },
        });
        // A coin is a d2 — log it like every other roll
        this.ctx.eventBus.emit(GameEventNames.DiceRoll, {
          rollType: "Coin Toss",
          diceType: "1d2",
          value: roll,
          total: roll,
          description: `Coin Toss: ${kickingTeam.name} kicks`,
          resultState: "none",
          teamId: kickingTeam.id,
        });
        this.kickingTeamId = kickingTeam.id;
        gs.startSetup(kickingTeam.id);
        break;
      }
      case "start-setup":
        this.assertTeam(cmd.kickingTeamId);
        this.kickingTeamId = cmd.kickingTeamId;
        gs.startSetup(cmd.kickingTeamId);
        break;
      case "place-player":
        if (!gs.placePlayer(cmd.playerId, cmd.x, cmd.y)) {
          throw new Error("illegal-placement");
        }
        break;
      case "remove-player":
        gs.removePlayer(cmd.playerId);
        break;
      case "swap-players":
        if (!gs.swapPlayers(cmd.player1Id, cmd.player2Id)) {
          throw new Error("illegal-swap");
        }
        break;
      case "confirm-setup":
        this.assertTeam(cmd.teamId);
        gs.confirmSetup(cmd.teamId);
        break;
      case "select-kicker":
        gs.selectKicker(cmd.playerId);
        break;
      case "kick-ball": {
        const kicker = this.requirePlayer(cmd.playerId);
        const isTeam1Kicking = kicker.teamId === this.ctx.team1.id;
        this.kickingTeamId = kicker.teamId;
        await gs.kickBall(isTeam1Kicking, cmd.playerId, cmd.x, cmd.y);
        break;
      }
      case "declare-action":
        if (!gs.declareAction(cmd.playerId, cmd.action)) {
          throw new Error("illegal-action-declaration");
        }
        break;
      case "move":
        await gs.movePlayer(cmd.playerId, cmd.path);
        break;
      case "fumblerooski":
        if (
          !gs.dropBallWithFumblerooski(cmd.playerId, {
            x: cmd.x,
            y: cmd.y,
          })
        ) {
          throw new Error("illegal-fumblerooski");
        }
        break;
      case "stand-up":
        await gs.standUp(cmd.playerId);
        break;
      case "block": {
        const attacker = this.requirePlayer(cmd.attackerId);
        const defender = this.requirePlayer(cmd.defenderId);
        // A Blitz allows only one block; refuse a second after the first.
        if (gs.hasUsedBlitzBlock(cmd.attackerId)) {
          throw new Error("blitz-block-already-used");
        }
        const allPlayers = [
          ...this.ctx.team1.players,
          ...this.ctx.team2.players,
        ];
        const analysis = this.blockValidator.analyzeBlock(
          attacker,
          defender,
          allPlayers,
          gs.getActiveTeamId()
        );
        await gs.rollBlockDice(
          cmd.attackerId,
          cmd.defenderId,
          analysis.diceCount,
          !analysis.isUphill
        );
        break;
      }
      case "multiple-block":
        await gs.multipleBlock(
          cmd.attackerId,
          cmd.defender1Id,
          cmd.defender2Id
        );
        break;
      case "jump":
        await gs.jumpPlayer(cmd.playerId, { x: cmd.x, y: cmd.y });
        break;
      case "pass":
      case "handoff": {
        const result = await gs.throwBall(cmd.playerId, cmd.x, cmd.y);
        if (!result.success) {
          throw new Error(result.result || "pass-failed");
        }
        break;
      }
      case "punt":
        await gs.puntBall(cmd.playerId, cmd.x, cmd.y);
        break;
      case "foul":
        await gs.foulPlayer(cmd.playerId, cmd.x, cmd.y);
        break;
      case "stab":
        await gs.stabPlayer(cmd.attackerId, cmd.defenderId);
        break;
      case "throw-teammate":
        await gs.throwTeammate(
          cmd.throwerId,
          cmd.teammateId,
          cmd.x,
          cmd.y,
          cmd.mode
        );
        break;
      case "throw-bomb":
        await gs.throwBomb(cmd.throwerId, cmd.x, cmd.y);
        break;
      case "ball-and-chain":
        await gs.ballAndChain(cmd.playerId, cmd.x, cmd.y);
        break;
      case "special-action":
        await gs.performSpecialAction(
          cmd.action as "breatheFire" | "vomit" | "gaze" | "chomp" | "chainsaw",
          cmd.attackerId,
          cmd.defenderId
        );
        break;
      case "end-activation":
        gs.finishActivation(cmd.playerId);
        break;
      case "end-turn":
        gs.endTurn();
        break;
      case "award-mvp": {
        if (gs.getPhase() !== GamePhase.GAME_OVER) {
          throw new Error("mvp-only-after-match");
        }
        this.assertTeam(cmd.teamId);
        const roll = this.ctx.rng.rollDie(cmd.nominatedPlayerIds.length);
        this.ctx.matchStats.awardMvp(cmd.teamId, cmd.nominatedPlayerIds, roll);
        break;
      }
      case "assign-awarded-touchdown": {
        if (gs.getPhase() !== GamePhase.GAME_OVER) {
          throw new Error("awarded-touchdown-only-after-match");
        }
        this.requirePlayer(cmd.playerId);
        this.ctx.matchStats.assignAwardedTouchdown(cmd.playerId);
        break;
      }

      // --- Decision replies ---
      case "team-reroll-block":
        gs.teamRerollBlock(cmd.attackerId);
        break;
      case "pro-reroll-block":
        gs.proRerollBlockDie(cmd.attackerId, cmd.dieIndex);
        break;
      case "choose-block-result": {
        const pending = this.takePending("block-dice");
        if (cmd.index < 0 || cmd.index >= pending.options.length) {
          this.pending = pending; // restore, reply was invalid
          throw new Error("invalid-block-result-index");
        }
        await gs.resolveBlock(
          pending.attackerId,
          pending.defenderId,
          pending.options[cmd.index]
        );
        break;
      }
      case "choose-push-direction": {
        const pending = this.takePending("push-direction");
        const valid = pending.options.some(
          (d) => d.x === cmd.x && d.y === cmd.y
        );
        if (!valid) {
          this.pending = pending;
          throw new Error("invalid-push-direction");
        }
        gs.executePush(
          pending.attackerId,
          pending.defenderId,
          { x: cmd.x, y: cmd.y },
          pending.resultType,
          false
        );
        break;
      }
      case "choose-follow-up": {
        const pending = this.takePending("follow-up");
        if (cmd.followUp) {
          // Free move: no movement cost, no dice (rush/dodge already paid)
          await gs.followUpPush(pending.attackerId, pending.targetSquare);
        }
        // A Blitz block leaves the player active to continue moving; a plain
        // block ends the activation here.
        gs.finishBlockActivation(pending.attackerId);
        break;
      }
      case "use-reroll": {
        const pending = this.takePending("reroll");
        if (cmd.source !== undefined && !pending.sources.includes(cmd.source)) {
          this.pending = pending; // restore, reply was invalid
          throw new Error("invalid-reroll-source");
        }
        if (!gs.answerReroll(cmd.accept, cmd.source)) {
          this.pending = pending;
          throw new Error("no-reroll-awaiting");
        }
        break;
      }
      case "use-reaction": {
        const pending = this.takePending("reaction");
        if (!gs.answerReaction(cmd.accept)) {
          this.pending = pending;
          throw new Error("no-reaction-awaiting");
        }
        break;
      }
      case "choose-interception": {
        const pending = this.takePending("interception");
        if (
          cmd.playerId !== undefined &&
          !pending.candidates.some((c) => c.playerId === cmd.playerId)
        ) {
          this.pending = pending; // restore, reply was invalid
          throw new Error("invalid-interception-player");
        }
        if (!gs.answerInterception(cmd.playerId)) {
          this.pending = pending;
          throw new Error("no-interception-awaiting");
        }
        break;
      }
      case "touchback": {
        const pending = this.takePending("touchback");
        if (!gs.awardTouchback(cmd.playerId)) {
          this.pending = pending; // restore, reply was invalid
          throw new Error("invalid-touchback-player");
        }
        break;
      }
    }
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
    if (name === GameEventNames.ReadyToStart) {
      // In the browser KickoffPhaseHandler starts play on this signal;
      // headless mirrors that so the kickoff chain flows into PLAY.
      if (this.autoStartOnReady && this.kickingTeamId) {
        this.ctx.gameService.startGame(this.kickingTeamId);
      }
      return;
    }
    if (name === GameEventNames.DecisionRequested) {
      // Awaitable decision: the engine is paused on this promise. Surface
      // it and wake execute()'s race so the response goes out now.
      if (data?.type === "reroll") {
        this.pending = {
          type: "reroll",
          playerId: data.playerId,
          chooserTeamId: data.chooserTeamId,
          rollKind: data.rollKind,
          sources: data.sources,
          skill: data.skill,
          roll: data.roll,
        };
      } else if (data?.type === "reaction") {
        this.pending = {
          type: "reaction",
          playerId: data.playerId,
          chooserTeamId: data.chooserTeamId,
          skill: data.skill,
          prompt: data.prompt,
        };
      } else if (data?.type === "interception") {
        this.pending = {
          type: "interception",
          chooserTeamId: data.chooserTeamId,
          passerId: data.passerId,
          candidates: data.candidates,
        };
      } else {
        return;
      }
      this.decisionWaiters.splice(0).forEach((wake) => wake());
      return;
    }
    if (name === GameEventNames.BlockDiceRolled) {
      const attacker = this.findPlayer(data.attackerId);
      const defender = this.findPlayer(data.defenderId);
      this.pending = {
        type: "block-dice",
        attackerId: data.attackerId,
        defenderId: data.defenderId,
        chooserTeamId: data.isAttackerChoice
          ? (attacker?.teamId ?? "")
          : (defender?.teamId ?? ""),
        options: data.results,
        teamRerollAvailable: data.teamRerollAvailable,
        proAvailable: data.proAvailable,
      };
    } else if (name === GameEventNames.UI_SelectPushDirection) {
      this.pending = {
        type: "push-direction",
        attackerId: data.attackerId,
        defenderId: data.defenderId,
        resultType: data.resultType,
        chooserTeamId: data.chooserTeamId,
        options: data.validDirections,
      };
    } else if (name === GameEventNames.PlayerMoved && data?.followUpData) {
      this.pending = {
        type: "follow-up",
        attackerId: data.followUpData.attackerId,
        targetSquare: data.followUpData.targetSquare,
      };
    } else if (name === GameEventNames.TouchbackAwarded) {
      this.pending = { type: "touchback", teamId: data.teamId };
    } else if (name === GameEventNames.UI_FollowUpPrompt) {
      // Crowd surf: the engine prompts the follow-up directly (there is no
      // PlayerMoved for the surfed defender)
      this.pending = {
        type: "follow-up",
        attackerId: data.attackerId,
        targetSquare: data.targetSquare,
      };
    }
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

  // ===== Legal action enumeration (built on existing validators) =====

  private enumerateLegalActions(focusPlayerId?: string): LegalActions {
    const gs = this.ctx.gameService;
    const state = gs.getState();
    const players: PlayerActions[] = [];

    const activeTeam = state.activeTeamId
      ? gs.getTeam(state.activeTeamId)
      : undefined;

    if (state.phase === GamePhase.PLAY && !this.pending && activeTeam) {
      const opponents = gs.getOpponents(activeTeam.id);

      for (const p of activeTeam.players) {
        if (!p.gridPosition) continue;
        if (!gs.canActivate(p.id)) continue;

        const adjacentStanding = opponents.filter(
          (o) => this.isAdjacent(p, o) && o.status === PlayerStatus.ACTIVE
        );
        const adjacentDown = opponents.filter(
          (o) =>
            this.isAdjacent(p, o) &&
            (o.status === PlayerStatus.PRONE ||
              o.status === PlayerStatus.STUNNED)
        );
        const carriesBall =
          !!state.ballPosition &&
          state.ballPosition.x === p.gridPosition.x &&
          state.ballPosition.y === p.gridPosition.y;

        const actions: ActionType[] = [];
        if (p.status === PlayerStatus.PRONE) {
          // Standing up only costs movement, so every movement-based action
          // stays available to a prone player. Only plain Block is not.
          actions.push("standUp", "move");
          if (!state.turn.hasBlitzed) actions.push("blitz");
          if (!state.turn.hasFouled) actions.push("foul");
        } else if (p.status === PlayerStatus.ACTIVE) {
          actions.push("move");
          if (adjacentStanding.length > 0) actions.push("block");
          if (!state.turn.hasBlitzed) actions.push("blitz");
          if (carriesBall && !state.turn.hasPassed) actions.push("pass");
          if (carriesBall && !state.turn.hasHandedOff) actions.push("handoff");
          if (!state.turn.hasFouled && adjacentDown.length > 0)
            actions.push("foul");
        }
        if (actions.length === 0) continue;

        const entry: PlayerActions = {
          playerId: p.id,
          playerName: p.playerName,
          actions,
        };
        if (focusPlayerId === p.id) {
          entry.moveTargets = gs
            .getAvailableMovements(p.id)
            .map(({ x, y }) => ({ x, y }) as GridPosition);
          entry.blockTargets = adjacentStanding.map((o) => o.id);
          entry.foulTargets = adjacentDown.map((o) => o.id);
        }
        players.push(entry);
      }
    }

    return {
      phase: state.phase,
      subPhase: state.subPhase ?? null,
      activeTeamId: state.activeTeamId,
      pendingDecision: this.pending,
      players,
      canEndTurn: state.phase === GamePhase.PLAY && !this.pending,
    };
  }

  // ===== Helpers =====

  private isAdjacent(a: Player, b: Player): boolean {
    if (!a.gridPosition || !b.gridPosition) return false;
    const dx = Math.abs(a.gridPosition.x - b.gridPosition.x);
    const dy = Math.abs(a.gridPosition.y - b.gridPosition.y);
    return dx <= 1 && dy <= 1 && dx + dy > 0;
  }

  private findPlayer(playerId: string): Player | undefined {
    return this.ctx.gameService.getPlayerById(playerId);
  }

  private requirePlayer(playerId: string): Player {
    const player = this.findPlayer(playerId);
    if (!player) throw new Error(`unknown-player:${playerId}`);
    return player;
  }

  private assertTeam(teamId: string): void {
    if (teamId !== this.ctx.team1.id && teamId !== this.ctx.team2.id) {
      throw new Error(`unknown-team:${teamId}`);
    }
  }

  /**
   * Let fire-and-forget engine chains (noDelay .then sequencing, the flow
   * queue) fully settle before reporting the outcome.
   */
  private async settle(): Promise<void> {
    // setImmediate beats setTimeout(0) clamping; fall back outside Node
    const tick =
      typeof setImmediate === "function"
        ? () => new Promise((resolve) => setImmediate(resolve))
        : () => new Promise((resolve) => setTimeout(resolve, 0));
    for (let i = 0; i < 10; i++) {
      await tick();
    }
  }

  private validateShape(command: unknown): string | null {
    if (typeof command !== "object" || command === null) {
      return "malformed-command: not an object";
    }
    const cmd = command as Record<string, unknown>;
    if (typeof cmd.type !== "string" || !(cmd.type in COMMAND_SHAPES)) {
      return `unknown-command-type: ${String(cmd.type)}`;
    }
    const shape = COMMAND_SHAPES[cmd.type];
    for (const [field, kind] of Object.entries(shape)) {
      const value = cmd[field];
      if (kind === "path") {
        const isPath =
          Array.isArray(value) &&
          value.length > 0 &&
          value.every(
            (step) =>
              typeof step === "object" &&
              step !== null &&
              typeof (step as GridPosition).x === "number" &&
              typeof (step as GridPosition).y === "number"
          );
        if (!isPath)
          return `malformed-command: '${field}' must be a non-empty {x,y}[]`;
      } else if (kind === "string-array") {
        const isStringArray =
          Array.isArray(value) &&
          value.length > 0 &&
          value.every((entry) => typeof entry === "string");
        if (!isStringArray) {
          return `malformed-command: '${field}' must be a non-empty string[]`;
        }
      } else if (typeof value !== kind) {
        return `malformed-command: '${field}' must be a ${kind}`;
      }
    }
    return null;
  }

  private respond(ok: boolean, reason?: string): CommandResponse {
    return {
      ok,
      ...(reason ? { reason } : {}),
      events: [...this.eventLog],
      snapshot: this.snapshot(),
      pendingDecision: this.pending,
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
