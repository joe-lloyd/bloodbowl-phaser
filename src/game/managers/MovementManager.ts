import { IEventBus } from "../../services/EventBus";
import { GameState } from "@/types/GameState";
import { Team } from "@/types/Team";
import { Player, PlayerStatus } from "@/types/Player";
import { MovementValidator } from "../validators/MovementValidator";
import { BallManager } from "./BallManager";
import { GameEventNames } from "../../types/events";

export class MovementManager {
  private movementValidator: MovementValidator = new MovementValidator();

  constructor(
    private eventBus: IEventBus,
    private state: GameState,
    private team1: Team,
    private team2: Team,
    private ballManager: BallManager,
    private callbacks: {
      onTurnover: (reason: string) => void;
      onActivationFinished: (playerId: string) => void;
    }
  ) {}

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

    // Prone players don't have tackle zones
    const opponents = opponentTeam.players.filter(
      (p: any) => p.gridPosition && p.status === PlayerStatus.ACTIVE
    );
    const teammates = team.players.filter(
      (p: any) => p.gridPosition && p.id !== player.id
    );

    // If prone, reduce effective MA by stand-up cost so validator finds correct range
    let effectiveMA = ma - used;
    if (player.status === PlayerStatus.PRONE) {
      const standUpCost = Math.min(3, ma);
      effectiveMA = Math.max(0, effectiveMA - standUpCost);
    } else {
      effectiveMA = ma - used;
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
   * Stand up a prone player (double-click action)
   */
  public async standUp(playerId: string): Promise<void> {
    const player = this.getPlayerById(playerId);
    if (!player || player.status !== PlayerStatus.PRONE) {
      return Promise.reject("Player is not prone");
    }

    const used = this.getMovementUsed(playerId);
    const standUpCost = Math.min(3, player.stats.MA);

    // Check if player has enough MA to stand
    if (used + standUpCost > player.stats.MA + 2) {
      return Promise.reject("Not enough movement to stand up");
    }

    // Stand up
    player.status = PlayerStatus.ACTIVE;
    this.state.turn.movementUsed.set(playerId, used + standUpCost);

    // Emit events
    this.eventBus.emit(GameEventNames.PlayerStoodUp, {
      playerId,
      cost: standUpCost,
    });
    this.eventBus.emit(GameEventNames.PlayerStatusChanged, {
      playerId,
      status: PlayerStatus.ACTIVE,
    });

    // Auto-finish if exhausted
    if (used + standUpCost >= player.stats.MA + 2) {
      this.callbacks.onActivationFinished(playerId);
    }

    return Promise.resolve();
  }

  public async movePlayer(
    playerId: string,
    path: { x: number; y: number }[]
  ): Promise<void> {
    const player = this.getPlayerById(playerId);
    if (!player) return Promise.reject("Player not found!");

    const oppTeam = player.teamId === this.team1.id ? this.team2 : this.team1;
    // Only standing players project tackle zones
    const opponents = oppTeam.players.filter(
      (p) => p.status === PlayerStatus.ACTIVE && p.gridPosition
    );

    // Validate
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

    // Stand up if prone (costs 3 MA or all MA if less)
    if (wasProne) {
      const standUpCost = Math.min(3, player.stats.MA);
      stepsTaken += standUpCost;
      player.status = PlayerStatus.ACTIVE;
      this.eventBus.emit(GameEventNames.PlayerStoodUp, {
        playerId,
        cost: standUpCost,
      });
      this.eventBus.emit(GameEventNames.PlayerStatusChanged, {
        playerId,
        status: PlayerStatus.ACTIVE,
      });
    }

    // Check if starting with ball
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

      stepsTaken++;
      const totalUsed = preUsed + stepsTaken;

      // Check for GFI
      if (totalUsed > player.stats.MA) {
        let target = 2; // Always 2+ for GFI
        const roll = Math.floor(Math.random() * 6) + 1;
        const success = roll >= target;

        this.eventBus.emit(GameEventNames.DiceRoll, {
          rollType: "Rush (GFI)",
          diceType: "d6",
          value: roll,
          total: roll,
          description: `Rush Roll (Target ${target}+): ${
            success ? "Success" : "FAILURE"
          }`,
          passed: success,
        });

        if (!success) {
          failed = true;
          currentPos = step;
          player.gridPosition = currentPos;

          console.log("GFI FAILED! Player trips.");
          player.status = PlayerStatus.PRONE;
          this.eventBus.emit(GameEventNames.PlayerKnockedDown, { playerId });
          this.eventBus.emit(GameEventNames.PlayerStatusChanged, {
            playerId,
            status: PlayerStatus.PRONE,
          });

          this.callbacks.onTurnover("Failed GFI");
          completedPath.push(step);
          break;
        }
      }

      // Move
      currentPos = step;
      completedPath.push(step);

      // Pickup Attempt
      if (
        !holdingBall &&
        this.state.ballPosition &&
        currentPos.x === this.state.ballPosition.x &&
        currentPos.y === this.state.ballPosition.y
      ) {
        const pickupSuccess = this.ballManager.attemptPickup(
          player,
          currentPos
        );
        if (pickupSuccess) {
          holdingBall = true;
        } else {
          failed = true;
          break; // Turnover handled in BallManager
        }
      }

      // Move Ball
      if (holdingBall) {
        this.state.ballPosition = { x: currentPos.x, y: currentPos.y };
        this.eventBus.emit(GameEventNames.BallPlaced, {
          x: currentPos.x,
          y: currentPos.y,
        });
      }
    }

    // Finalize
    player.gridPosition = currentPos;
    this.state.turn.movementUsed.set(playerId, preUsed + stepsTaken);

    this.eventBus.emit(GameEventNames.PlayerMoved, {
      playerId,
      from: result.path[0] || {
        x: player.gridPosition.x,
        y: player.gridPosition.y,
      },
      to: currentPos,
      path: completedPath,
    });

    // Auto-finish if exhausted
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
