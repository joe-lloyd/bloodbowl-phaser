import { IEventBus } from "../../services/EventBus";
import { GameState } from "@/types/GameState";
import { Team } from "@/types/Team";
import {
  Player,
  PlayerStatus,
  PlayerCondition,
  hasCondition,
} from "@/types/Player";
import { MovementValidator } from "../validators/MovementValidator";
import { GameEventNames } from "../../types/events";
import { DodgeController } from "../controllers/DodgeController";
import { PickupOperation } from "../operations/PickupOperation";
import { BounceOperation } from "../operations/BounceOperation";
import { ArmourOperation } from "../operations/ArmourOperation";
import { IGameService } from "@/services/interfaces/IGameService";
import { DiceController } from "../controllers/DiceController";
import { steadyFootingSaves } from "../rules/steadyFooting";
import { isInEndZone } from "../elements/GridUtils";
import { GameConfig } from "../../config/GameConfig";
import {
  withRerollOffer,
  foldTrigger,
  gatherParticipants,
  adjacentStanding,
  DodgeDeclaredContext,
  DodgeResolvedContext,
} from "../skills";
import { moveAllowance, standUpCost } from "../skills/movement";
import {
  RushDeclaredContext,
  StandUpRollContext,
  JumpDeclaredContext,
} from "../skills/SkillRule";
import { SkillType, hasSkill } from "../../types/Skills";
import { jumpTargets } from "../rules/jump";

export class MovementManager {
  private movementValidator: MovementValidator = new MovementValidator();
  private dodgeController: DodgeController;

  constructor(
    private eventBus: IEventBus,
    private state: GameState,
    private team1: Team,
    private team2: Team,
    private diceController: DiceController,
    private callbacks: {
      onTurnover: (reason: string) => void;
      onActivationFinished: (playerId: string) => void;
      onTouchdown?: (teamId: string) => void;
    }
  ) {
    this.dodgeController = new DodgeController(diceController);
  }

  public getMovementUsed(playerId: string): number {
    return this.state.turn.movementUsed.get(playerId) || 0;
  }

  public getAvailableMovements(
    playerId: string
  ): { x: number; y: number; cost?: number }[] {
    const player = this.getPlayerById(playerId);
    if (!player || player.teamId !== this.state.activeTeamId) return [];

    const used = this.getMovementUsed(playerId);
    const ma = player.stats.MA;

    if (used >= moveAllowance(player)) return [];

    const team = player.teamId === this.team1.id ? this.team1 : this.team2;
    const opponentTeam =
      player.teamId === this.team1.id ? this.team2 : this.team1;

    const opponents = opponentTeam.players.filter(
      (p) => p.gridPosition && p.status === PlayerStatus.ACTIVE
    );
    const teammates = team.players.filter(
      (p) => p.gridPosition && p.id !== player.id
    );

    let effectiveMA = ma - used;
    if (player.status === PlayerStatus.PRONE) {
      effectiveMA = Math.max(0, effectiveMA - standUpCost(player));
    }

    const proxyPlayer = {
      ...player,
      stats: {
        ...player.stats,
        MA: effectiveMA,
      },
    };

    return this.movementValidator.findReachableSquares(
      proxyPlayer as Player,
      opponents,
      teammates
    );
  }

  /**
   * 2025: a player with MA less than 3 must roll to stand up (4+, natural
   * 1 fails; Timmm-ber! adds +1 per Open Standing adjacent team-mate). A
   * failed attempt keeps them Prone, spends the movement, and ends the
   * activation. Returns true when the player may stand.
   */
  private async rollToStand(player: Player): Promise<boolean> {
    if (player.stats.MA >= 3) return true;
    const team = player.teamId === this.team1.id ? this.team1 : this.team2;
    const oppTeam = player.teamId === this.team1.id ? this.team2 : this.team1;
    const ctx: StandUpRollContext = {
      player,
      teammates: team.players.filter(
        (p) => p.id !== player.id && p.gridPosition
      ),
      opponents: oppTeam.players.filter((p) => p.gridPosition),
      modifiers: 0,
      triggers: [],
    };
    await foldTrigger("onStandUpRoll", [player], ctx);
    for (const t of ctx.triggers) {
      this.eventBus.emit(GameEventNames.SkillTriggered, t);
    }
    const check = this.diceController.rollSkillCheck(
      "Stand Up",
      4,
      ctx.modifiers,
      player.playerName
    );
    return check.success;
  }

  public async standUp(playerId: string): Promise<void> {
    const player = this.getPlayerById(playerId);
    if (!player || player.status !== PlayerStatus.PRONE) {
      return Promise.reject("Player is not prone");
    }

    const used = this.getMovementUsed(playerId);
    const cost = standUpCost(player);

    if (used + cost > moveAllowance(player)) {
      return Promise.reject("Not enough movement to stand up");
    }

    if (!(await this.rollToStand(player))) {
      // Failed the stand-up roll: still Prone, movement spent, activation over
      this.state.turn.movementUsed.set(playerId, used + cost);
      this.callbacks.onActivationFinished(playerId);
      return;
    }

    player.status = PlayerStatus.ACTIVE;
    this.state.turn.movementUsed.set(playerId, used + cost);

    this.eventBus.emit(GameEventNames.PlayerStoodUp, {
      playerId,
      cost,
    });
    this.eventBus.emit(GameEventNames.PlayerStatusChanged, player);

    if (used + cost >= moveAllowance(player)) {
      this.callbacks.onActivationFinished(playerId);
    }

    return Promise.resolve();
  }

  public async movePlayer(
    playerId: string,
    path: { x: number; y: number }[],
    context?: import("../core/GameFlowManager").FlowContext
  ): Promise<void> {
    const player = this.getPlayerById(playerId);
    if (!player) return Promise.reject("Player not found!");

    // Rooted/Chomped players may not leave their square (2025 conditions)
    if (
      hasCondition(player, PlayerCondition.ROOTED) ||
      hasCondition(player, PlayerCondition.CHOMPED)
    ) {
      this.eventBus.emit(
        GameEventNames.UI_Notification,
        `${player.playerName} cannot leave their square!`
      );
      return Promise.reject("Cannot move");
    }

    const gameService = context?.gameService as IGameService;
    const flowManager = context?.flowManager;

    const oppTeam = player.teamId === this.team1.id ? this.team2 : this.team1;
    const opponents = oppTeam.players.filter(
      (p) => p.status === PlayerStatus.ACTIVE && p.gridPosition
    );

    const result = this.movementValidator.validatePath(
      player,
      [{ x: player.gridPosition!.x, y: player.gridPosition!.y }, ...path],
      opponents
    );
    if (!result.valid) {
      console.warn(`Invalid move attempted for player ${playerId}`);
      return Promise.reject("Invalid Move");
    }

    let currentPos = player.gridPosition!;
    const completedPath: { x: number; y: number }[] = [];
    let failed = false;
    /** Tentacles held the dodger — the activation ends where they stand */
    let heldFast = false;
    let stepsTaken = 0;
    const preUsed = this.getMovementUsed(playerId);
    const wasProne = player.status === PlayerStatus.PRONE;

    if (wasProne) {
      const cost = standUpCost(player);
      if (!(await this.rollToStand(player))) {
        // Failed the stand-up roll: still Prone, movement spent, activation over
        this.state.turn.movementUsed.set(playerId, preUsed + cost);
        this.callbacks.onActivationFinished(playerId);
        return;
      }
      stepsTaken += cost;
      player.status = PlayerStatus.ACTIVE;
      this.eventBus.emit(GameEventNames.PlayerStoodUp, {
        playerId,
        cost,
      });
      this.eventBus.emit(GameEventNames.PlayerStatusChanged, player);
    }

    let holdingBall = false;
    if (
      this.state.ballPosition &&
      player.gridPosition &&
      this.state.ballPosition.x === player.gridPosition.x &&
      this.state.ballPosition.y === player.gridPosition.y
    ) {
      holdingBall = true;
    }

    // Where the ball visual starts travelling with the mover and after how
    // many walked squares it joins (0 = carried from the start)
    let ballFrom: { x: number; y: number } | null = holdingBall
      ? { ...player.gridPosition! }
      : null;
    let ballJoinStep = 0;

    for (const step of path) {
      if (failed) break;

      if (this.dodgeController.isDodgeRequired(currentPos, opponents)) {
        // Trigger point: dodge declared — rules from the dodger AND the
        // opponents marking the vacated or destination square may adjust
        // the roll (Prehensile Tail, Titchy) or deny the skill reroll
        // (Tackle)
        const markingPenalty = this.dodgeController.calculateDodgeModifiers(
          step,
          opponents
        );
        const dodgeCtx: DodgeDeclaredContext = {
          player,
          from: { ...currentPos },
          to: { ...step },
          modifiers: markingPenalty,
          markingPenalty,
          skillRerollAllowed: true,
          decisions: gameService?.getDecisionService(),
          flow: flowManager,
          arbiter: gameService?.getRerollArbiter(),
          dice: this.diceController,
          triggers: [],
        };
        await foldTrigger(
          "onDodgeDeclared",
          gatherParticipants(player, undefined, [
            ...adjacentStanding(currentPos, opponents),
            ...adjacentStanding(step, opponents),
          ]),
          dodgeCtx
        );
        dodgeCtx.triggers.forEach((t) =>
          this.eventBus.emit(GameEventNames.SkillTriggered, t)
        );

        // Tentacles held the dodger: no Agility Test, no move, and the
        // activation ends — not a turnover
        if (dodgeCtx.escapeCancelled) {
          heldFast = true;
          break;
        }

        const rollDodge = () =>
          this.dodgeController.attemptDodge(
            player,
            step,
            opponents,
            dodgeCtx.modifiers
          );
        // A failed dodge may be rerolled (Dodge skill / team reroll); the
        // move pauses on the coach's decision
        const dodgeResult = gameService
          ? await withRerollOffer(
              { gameService, eventBus: this.eventBus },
              player,
              "dodge",
              rollDodge,
              { skillAllowed: dodgeCtx.skillRerollAllowed }
            )
          : rollDodge();

        // Trigger point: dodge resolved — markers of the vacated square
        // react after any re-rolls (Diving Tackle, Shadowing)
        const resolvedCtx: DodgeResolvedContext = {
          player,
          from: { ...currentPos },
          to: { ...step },
          naturalRoll: dodgeResult.roll,
          target: dodgeResult.target,
          modifiers: dodgeResult.modifiers,
          success: dodgeResult.success,
          decisions: gameService?.getDecisionService(),
          flow: flowManager,
          arbiter: gameService?.getRerollArbiter(),
          dice: this.diceController,
          triggers: [],
        };
        await foldTrigger(
          "onDodgeResolved",
          gatherParticipants(
            player,
            undefined,
            adjacentStanding(currentPos, opponents)
          ),
          resolvedCtx
        );
        resolvedCtx.triggers.forEach((t) =>
          this.eventBus.emit(GameEventNames.SkillTriggered, t)
        );

        // Shadowing: the chaser steps into the square being vacated —
        // free, Standing, no dice for them
        const applyShadowFollow = (into: { x: number; y: number }) => {
          if (!resolvedCtx.followInto) return;
          const shadower = opponents.find(
            (p) => p.id === resolvedCtx.followInto
          );
          if (!shadower?.gridPosition) return;
          const shadowerFrom = { ...shadower.gridPosition };
          shadower.gridPosition = { ...into };
          this.eventBus.emit(GameEventNames.PlayerMoved, {
            playerId: shadower.id,
            from: shadowerFrom,
            to: { ...into },
            path: [shadowerFrom, { ...into }],
            ballJoinStep: 0,
          });
        };

        // Diving Tackle: the diver is placed Prone in the vacated square
        // (no Armour Roll — placed, not Knocked Down)
        if (resolvedCtx.proneInVacated) {
          const diver = opponents.find(
            (p) => p.id === resolvedCtx.proneInVacated
          );
          if (diver?.gridPosition) {
            const diverFrom = { ...diver.gridPosition };
            diver.gridPosition = { ...currentPos };
            diver.status = PlayerStatus.PRONE;
            this.eventBus.emit(GameEventNames.PlayerMoved, {
              playerId: diver.id,
              from: diverFrom,
              to: { ...currentPos },
              path: [diverFrom, { ...currentPos }],
              ballJoinStep: 0,
            });
            this.eventBus.emit(GameEventNames.PlayerStatusChanged, diver);
          }
        }

        if (
          !resolvedCtx.success &&
          !steadyFootingSaves(player, this.diceController, this.eventBus)
        ) {
          failed = true;
          // The square the dodger was leaving — Arm Bar markers of it react.
          const vacatedSquare = { ...currentPos };
          currentPos = step;
          player.gridPosition = currentPos;
          player.status = PlayerStatus.PRONE;
          this.eventBus.emit(GameEventNames.PlayerKnockedDown, { playerId });
          this.eventBus.emit(GameEventNames.PlayerStatusChanged, player);

          applyShadowFollow(vacatedSquare);

          if (holdingBall && flowManager) {
            gameService.setBallPosition(currentPos.x, currentPos.y);
            flowManager.add(new BounceOperation(currentPos), true);
          }

          if (flowManager) {
            flowManager.add(
              new ArmourOperation(playerId, undefined, {
                cause: "dodge",
                vacatedSquare,
              }),
              true
            );
          }

          this.callbacks.onTurnover("Failed Dodge");
          completedPath.push(step);
          break;
        }
        // A failed dodge that Steady Footing saved keeps the player Standing:
        // fall through as if it had succeeded — they move on and continue their
        // activation, no Armour Roll and no Turnover.

        applyShadowFollow({ ...resolvedCtx.from });
      }

      stepsTaken++;
      const totalUsed = preUsed + stepsTaken;

      if (totalUsed > player.stats.MA) {
        // Trigger point: rush declared — rules may modify it (Drunkard)
        const rushCtx: RushDeclaredContext = {
          player,
          modifiers: 0,
          triggers: [],
        };
        await foldTrigger("onRushDeclared", [player], rushCtx);
        for (const t of rushCtx.triggers) {
          this.eventBus.emit(GameEventNames.SkillTriggered, t);
        }
        const rollRush = () =>
          this.diceController.rollSkillCheck(
            "Rush (GFI)",
            2,
            rushCtx.modifiers,
            player.playerName
          );
        // A failed rush may be rerolled (Sure Feet / team reroll)
        const check = gameService
          ? await withRerollOffer(
              { gameService, eventBus: this.eventBus },
              player,
              "rush",
              rollRush
            )
          : rollRush();

        if (
          !check.success &&
          !steadyFootingSaves(player, this.diceController, this.eventBus)
        ) {
          failed = true;
          currentPos = step;
          player.gridPosition = currentPos;
          player.status = PlayerStatus.PRONE;
          this.eventBus.emit(GameEventNames.PlayerKnockedDown, { playerId });
          this.eventBus.emit(GameEventNames.PlayerStatusChanged, player);

          if (holdingBall && flowManager) {
            gameService.setBallPosition(currentPos.x, currentPos.y);
            flowManager.add(new BounceOperation(currentPos), true);
          }

          if (flowManager) {
            flowManager.add(new ArmourOperation(playerId), true);
          }

          this.callbacks.onTurnover("Failed GFI");
          completedPath.push(step);
          break;
        }
        // A failed Rush that Steady Footing saved keeps the player Standing:
        // they move into the square and may keep going, no fall and no Turnover.
      }

      currentPos = step;
      player.gridPosition = currentPos;
      completedPath.push(step);

      if (
        !holdingBall &&
        this.state.ballPosition &&
        currentPos.x === this.state.ballPosition.x &&
        currentPos.y === this.state.ballPosition.y
      ) {
        if (context) {
          const pickupOp = new PickupOperation(playerId);
          await pickupOp.execute(context);

          // Read the operation's own result: on a failure the bounce runs
          // asynchronously, so the ball can still be on this square right
          // now — checking positions here used to let the mover walk on
          // with a ball they never picked up.
          holdingBall = pickupOp.success;

          if (!holdingBall) {
            failed = true;
            break;
          }

          ballFrom = { ...currentPos };
          ballJoinStep = completedPath.length;
        }
      }

      if (holdingBall) {
        this.state.ballPosition = { x: currentPos.x, y: currentPos.y };
        this.eventBus.emit(GameEventNames.BallPlaced, {
          x: currentPos.x,
          y: currentPos.y,
        });

        const side = player.teamId === this.team1.id ? 1 : 2;
        if (isInEndZone(currentPos, GameConfig.PITCH_WIDTH, side)) {
          player.gridPosition = currentPos;
          this.state.turn.movementUsed.set(playerId, preUsed + stepsTaken);
          this.eventBus.emit(GameEventNames.PlayerMoved, {
            playerId,
            from: result.path[0] || currentPos,
            to: currentPos,
            path: completedPath,
            ballFrom: ballFrom ?? undefined,
            ballPath: ballFrom ? completedPath.slice(ballJoinStep) : undefined,
            ballJoinStep,
          });
          this.callbacks.onTouchdown?.(player.teamId);
          return Promise.resolve();
        }
      }
    }

    player.gridPosition = currentPos;
    this.state.turn.movementUsed.set(playerId, preUsed + stepsTaken);

    this.eventBus.emit(GameEventNames.PlayerMoved, {
      playerId,
      from: result.path[0] || currentPos,
      to: currentPos,
      path: completedPath,
      ballFrom: ballFrom ?? undefined,
      ballPath: ballFrom ? completedPath.slice(ballJoinStep) : undefined,
      ballJoinStep,
    });

    if (heldFast || preUsed + stepsTaken >= moveAllowance(player)) {
      // Tentacles ends the activation where the player stands (no turnover)
      this.callbacks.onActivationFinished(playerId);
    }

    return Promise.resolve();
  }

  /**
   * Jump over a single adjacent square into an unoccupied square beyond, as
   * part of a Move Action (2025 rulebook p.56). By default the jumped-over
   * square must hold a Prone or Stunned player; Leap/Pogo let a player Jump
   * over any square. The Jump costs 2 squares of Movement (Rushing as needed,
   * each Rush rolled before the Jump), and an Agility Test with a negative
   * modifier equal to the greater of the opponents Marking the from square and
   * the to square. Pass → Stand in the target and continue; fail → Fall Over in
   * the target (a natural 1 → Fall Over where they stand); either fall ends the
   * activation and is a Turnover.
   */
  public async jumpPlayer(
    playerId: string,
    target: { x: number; y: number },
    context?: import("../core/GameFlowManager").FlowContext
  ): Promise<void> {
    const player = this.getPlayerById(playerId);
    if (!player?.gridPosition) return Promise.reject("Player not found!");

    if (
      hasCondition(player, PlayerCondition.ROOTED) ||
      hasCondition(player, PlayerCondition.CHOMPED)
    ) {
      this.eventBus.emit(
        GameEventNames.UI_Notification,
        `${player.playerName} cannot leave their square!`
      );
      return Promise.reject("Cannot move");
    }
    if (player.status !== PlayerStatus.ACTIVE) {
      return Promise.reject("Only a Standing player may Jump");
    }

    const gameService = context?.gameService as IGameService;
    const flowManager = context?.flowManager;

    const from = { ...player.gridPosition };
    const oppTeam = player.teamId === this.team1.id ? this.team2 : this.team1;
    const opponents = oppTeam.players.filter(
      (p) => p.status === PlayerStatus.ACTIVE && p.gridPosition
    );
    const others = [...this.team1.players, ...this.team2.players].filter(
      (p) => p.id !== player.id && p.gridPosition
    );
    const canJumpAnything =
      hasSkill(player.skills, SkillType.LEAP) ||
      hasSkill(player.skills, SkillType.POGO);
    const inBounds = (x: number, y: number) =>
      x >= 0 &&
      y >= 0 &&
      x < GameConfig.PITCH_WIDTH &&
      y < GameConfig.PITCH_HEIGHT;

    // The target must be one of the jumped-over player's push-back squares.
    const chosen = jumpTargets(from, others, canJumpAnything, inBounds).find(
      (t) => t.dest.x === target.x && t.dest.y === target.y
    );
    if (!chosen) {
      this.eventBus.emit(
        GameEventNames.UI_Notification,
        "You may only Jump over an adjacent player into their push-back squares"
      );
      return Promise.reject("Invalid Jump");
    }
    const over = chosen.over;

    // Cost: a Jump moves 2 squares; those beyond the MA are Rushes.
    const preUsed = this.getMovementUsed(playerId);
    const JUMP_COST = 2;
    if (preUsed + JUMP_COST > moveAllowance(player)) {
      this.eventBus.emit(
        GameEventNames.UI_Notification,
        `${player.playerName} does not have the Movement to Jump`
      );
      return Promise.reject("Not enough movement to Jump");
    }
    const holdingBall =
      !!this.state.ballPosition &&
      this.state.ballPosition.x === from.x &&
      this.state.ballPosition.y === from.y;
    const rushesNeeded = Math.max(0, preUsed + JUMP_COST - player.stats.MA);

    // Roll each Rush BEFORE the Jump test. A failed Rush drops the player in
    // the square they are in, ends the activation, and is a Turnover.
    for (let i = 0; i < rushesNeeded; i++) {
      const rushCtx: RushDeclaredContext = {
        player,
        modifiers: 0,
        triggers: [],
      };
      await foldTrigger("onRushDeclared", [player], rushCtx);
      rushCtx.triggers.forEach((t) =>
        this.eventBus.emit(GameEventNames.SkillTriggered, t)
      );
      const rollRush = () =>
        this.diceController.rollSkillCheck(
          "Rush (GFI)",
          2,
          rushCtx.modifiers,
          player.playerName
        );
      const check = gameService
        ? await withRerollOffer(
            { gameService, eventBus: this.eventBus },
            player,
            "rush",
            rollRush
          )
        : rollRush();
      if (
        !check.success &&
        !steadyFootingSaves(player, this.diceController, this.eventBus)
      ) {
        player.status = PlayerStatus.PRONE;
        this.state.turn.movementUsed.set(playerId, moveAllowance(player));
        this.eventBus.emit(GameEventNames.PlayerKnockedDown, { playerId });
        this.eventBus.emit(GameEventNames.PlayerStatusChanged, player);
        if (holdingBall && flowManager) {
          gameService.setBallPosition(from.x, from.y);
          flowManager.add(new BounceOperation(from), true);
        }
        if (flowManager) flowManager.add(new ArmourOperation(playerId), true);
        this.callbacks.onTurnover("Failed GFI");
        this.callbacks.onActivationFinished(playerId);
        return;
      }
    }

    // Marking penalty: the greater of the markers on the from and to squares.
    const markFrom = -this.dodgeController.calculateDodgeModifiers(
      from,
      opponents
    );
    const markTo = -this.dodgeController.calculateDodgeModifiers(
      target,
      opponents
    );
    const penalty = Math.max(markFrom, markTo);
    const jumpCtx: JumpDeclaredContext = {
      player,
      from,
      to: { ...target },
      over: { ...over },
      negativeModifier: -penalty,
      bonusModifier: 0,
      decisions: gameService?.getDecisionService(),
      flow: flowManager,
      arbiter: gameService?.getRerollArbiter(),
      dice: this.diceController,
      triggers: [],
    };
    await foldTrigger("onJumpDeclared", [player], jumpCtx);
    jumpCtx.triggers.forEach((t) =>
      this.eventBus.emit(GameEventNames.SkillTriggered, t)
    );
    const modifier = jumpCtx.negativeModifier + jumpCtx.bonusModifier;

    const check = this.diceController.rollSkillCheck(
      "Jump",
      player.stats.AG,
      modifier,
      player.playerName
    );
    this.state.turn.movementUsed.set(playerId, preUsed + JUMP_COST);

    if (check.success) {
      player.gridPosition = { ...target };
      this.eventBus.emit(GameEventNames.PlayerMoved, {
        playerId,
        from,
        to: { ...target },
        path: [from, { ...target }],
        ballFrom: holdingBall ? from : undefined,
        ballPath: holdingBall ? [from, { ...target }] : undefined,
        ballJoinStep: 0,
      });
      if (holdingBall) {
        gameService?.setBallPosition(target.x, target.y);
        this.state.ballPosition = { ...target };
        this.eventBus.emit(GameEventNames.BallPlaced, { ...target });
        const side = player.teamId === this.team1.id ? 1 : 2;
        if (isInEndZone(target, GameConfig.PITCH_WIDTH, side)) {
          this.callbacks.onTouchdown?.(player.teamId);
          return;
        }
      }
      if (preUsed + JUMP_COST >= moveAllowance(player)) {
        this.callbacks.onActivationFinished(playerId);
      }
      return;
    }

    // Failure: a natural 1 Falls Over where they stand; any other failure
    // Falls Over in the target square. Either way the activation ends and it
    // is a Turnover.
    const fallSquare = check.roll === 1 ? from : { ...target };
    player.gridPosition = { ...fallSquare };
    player.status = PlayerStatus.PRONE;
    if (fallSquare.x !== from.x || fallSquare.y !== from.y) {
      this.eventBus.emit(GameEventNames.PlayerMoved, {
        playerId,
        from,
        to: { ...fallSquare },
        path: [from, { ...fallSquare }],
        ballJoinStep: 0,
      });
    }
    this.eventBus.emit(GameEventNames.PlayerKnockedDown, { playerId });
    this.eventBus.emit(GameEventNames.PlayerStatusChanged, player);
    if (holdingBall && flowManager) {
      gameService.setBallPosition(fallSquare.x, fallSquare.y);
      flowManager.add(new BounceOperation(fallSquare), true);
    }
    if (flowManager) flowManager.add(new ArmourOperation(playerId), true);
    this.callbacks.onTurnover("Failed Jump");
    this.callbacks.onActivationFinished(playerId);
  }

  private getPlayerById(playerId: string): Player | undefined {
    return (
      this.team1.players.find((p) => p.id === playerId) ||
      this.team2.players.find((p) => p.id === playerId)
    );
  }
}
