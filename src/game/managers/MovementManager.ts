import { IEventBus } from "../../services/EventBus";
import { GameState } from "@/types/GameState";
import { Team } from "@/types/Team";
import { Player, PlayerStatus } from "@/types/Player";
import { MovementValidator } from "../validators/MovementValidator";
import { GameEventNames } from "../../types/events";
import { DodgeController } from "../controllers/DodgeController";
import { PickupOperation } from "../operations/PickupOperation";
import { BounceOperation } from "../operations/BounceOperation";
import { ArmourOperation } from "../operations/ArmourOperation";
import { IGameService } from "@/services/interfaces/IGameService";
import { DiceController } from "../controllers/DiceController";

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

    if (used >= ma + 2) return [];

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
      const standUpCost = Math.min(3, ma);
      effectiveMA = Math.max(0, effectiveMA - standUpCost);
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

  public async standUp(playerId: string): Promise<void> {
    const player = this.getPlayerById(playerId);
    if (!player || player.status !== PlayerStatus.PRONE) {
      return Promise.reject("Player is not prone");
    }

    const used = this.getMovementUsed(playerId);
    const standUpCost = Math.min(3, player.stats.MA);

    if (used + standUpCost > player.stats.MA + 2) {
      return Promise.reject("Not enough movement to stand up");
    }

    player.status = PlayerStatus.ACTIVE;
    this.state.turn.movementUsed.set(playerId, used + standUpCost);

    this.eventBus.emit(GameEventNames.PlayerStoodUp, {
      playerId,
      cost: standUpCost,
    });
    this.eventBus.emit(GameEventNames.PlayerStatusChanged, player);

    if (used + standUpCost >= player.stats.MA + 2) {
      this.callbacks.onActivationFinished(playerId);
    }

    return Promise.resolve();
  }

  public async movePlayer(
    playerId: string,
    path: { x: number; y: number }[],
    context?: any
  ): Promise<void> {
    const player = this.getPlayerById(playerId);
    if (!player) return Promise.reject("Player not found!");

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
    let stepsTaken = 0;
    const preUsed = this.getMovementUsed(playerId);
    const wasProne = player.status === PlayerStatus.PRONE;

    if (wasProne) {
      const standUpCost = Math.min(3, player.stats.MA);
      stepsTaken += standUpCost;
      player.status = PlayerStatus.ACTIVE;
      this.eventBus.emit(GameEventNames.PlayerStoodUp, {
        playerId,
        cost: standUpCost,
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

    for (const step of path) {
      if (failed) break;

      if (this.dodgeController.isDodgeRequired(currentPos, opponents)) {
        const dodgeResult = this.dodgeController.attemptDodge(
          player,
          step,
          opponents
        );

        if (!dodgeResult.success) {
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

          this.callbacks.onTurnover("Failed Dodge");
          completedPath.push(step);
          break;
        }
      }

      stepsTaken++;
      const totalUsed = preUsed + stepsTaken;

      if (totalUsed > player.stats.MA) {
        const check = this.diceController.rollSkillCheck(
          "Rush (GFI)",
          2,
          0,
          player.playerName
        );

        if (!check.success) {
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

          holdingBall =
            this.state.ballPosition?.x === currentPos.x &&
            this.state.ballPosition?.y === currentPos.y;

          if (!holdingBall) {
            failed = true;
            break;
          }
        }
      }

      if (holdingBall) {
        this.state.ballPosition = { x: currentPos.x, y: currentPos.y };
        this.eventBus.emit(GameEventNames.BallPlaced, {
          x: currentPos.x,
          y: currentPos.y,
        });
      }
    }

    player.gridPosition = currentPos;
    this.state.turn.movementUsed.set(playerId, preUsed + stepsTaken);

    this.eventBus.emit(GameEventNames.PlayerMoved, {
      playerId,
      from: result.path[0] || currentPos,
      to: currentPos,
      path: completedPath,
    });

    if (preUsed + stepsTaken >= player.stats.MA + 2) {
      this.callbacks.onActivationFinished(playerId);
    }

    return Promise.resolve();
  }

  private getPlayerById(playerId: string): Player | undefined {
    return (
      this.team1.players.find((p) => p.id === playerId) ||
      this.team2.players.find((p) => p.id === playerId)
    );
  }
}
