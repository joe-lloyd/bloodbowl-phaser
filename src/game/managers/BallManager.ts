import { IEventBus } from "../../services/EventBus";
import { GameState, GamePhase, SubPhase } from "@/types/GameState";
import { Team } from "@/types/Team";
import { Player, PlayerStatus } from "@/types/Player";
import { GameEventNames } from "../../types/events";

import { WeatherManager } from "./WeatherManager";
import { KickoffController } from "../controllers/KickoffController";
import { PickupController } from "../controllers/PickupController";
import { BallMovementController } from "../controllers/BallMovementController";
import { DiceController } from "../controllers/DiceController";

/**
 * BallManager
 *
 * Purpose: The central authority for the Ball's state and lifecycle.
 * It maintians the "Single Source of Truth" for where the ball is and who has it.
 * It orchestrates high-level sequences but delegates specific rule calculations to controllers.
 */
export class BallManager {
  private diceController: DiceController; // private or public? PassController needs movementController.
  public movementController: BallMovementController; // Public so GameService can inject it into PassController
  public kickoffController: KickoffController;
  public pickupController: PickupController;

  constructor(
    private eventBus: IEventBus,
    private state: GameState,
    private team1: Team,
    private team2: Team,
    weatherService: WeatherManager,
    private callbacks: {
      onTurnover: (reason: string) => void;
      onPhaseChange: (phase: GamePhase, subPhase: SubPhase) => void;
      onBallPlaced: (x: number, y: number) => void;
    }
  ) {
    this.diceController = new DiceController(eventBus);

    // Instantiate controllers with DiceController
    this.movementController = new BallMovementController(this.diceController);
    this.kickoffController = new KickoffController(
      eventBus,
      this.movementController,
      weatherService,
      this.diceController
    );
    this.pickupController = new PickupController(eventBus, this.diceController);
  }

  // --- KICKOFF ORCHESTRATION ---

  public kickBall(
    isTeam1Kicking: boolean,
    playerId: string,
    targetX: number,
    targetY: number
  ): void {
    // 1. Transition State
    this.callbacks.onPhaseChange(GamePhase.KICKOFF, SubPhase.ROLL_KICKOFF);

    // 2. Calculate Deviation (using Controller)
    const result = this.kickoffController.calculateKickDestination(
      targetX,
      targetY,
      isTeam1Kicking
    );

    // 3. Update State
    this.state.ballPosition = { x: result.finalX, y: result.finalY };

    // 4. Emit Event
    // Calculate direction and distance for visual consistency if needed,
    // or we update the event type. For now, we mock direction/distance as they are legacy
    // fields for the animation, but the animation usually relies on finalX/finalY or targets.
    // Let's assume 0 for now or calculate roughly.
    this.eventBus.emit(GameEventNames.BallKicked, {
      playerId,
      targetX,
      targetY,
      direction: 0, // Legacy field
      distance: 0, // Legacy field
      finalX: result.finalX,
      finalY: result.finalY,
    });

    // 5. Chain to Event Table
    setTimeout(() => this.rollKickoff(), 1000);
  }

  public rollKickoff(): void {
    this.callbacks.onPhaseChange(GamePhase.KICKOFF, SubPhase.RESOLVE_KICKOFF);

    // Delegate to Controller
    this.kickoffController.rollKickoffEvent();

    setTimeout(() => {
      this.callbacks.onPhaseChange(GamePhase.KICKOFF, SubPhase.PLACE_BALL);
      this.resolveBallPlacement();
    }, 2000);
  }

  public resolveBallPlacement(): void {
    setTimeout(() => {
      this.eventBus.emit(GameEventNames.ReadyToStart);
    }, 1000);
  }

  // --- PICKUP ORCHESTRATION ---

  public attemptPickup(
    player: Player,
    position: { x: number; y: number }
  ): boolean {
    // 1. Calculate Modifiers (State dependent)
    const oppTeam = player.teamId === this.team1.id ? this.team2 : this.team1;
    let standingEnemies = 0;

    oppTeam.players.forEach((p) => {
      if (p.status === PlayerStatus.ACTIVE && p.gridPosition) {
        const dx = Math.abs(p.gridPosition.x - position.x);
        const dy = Math.abs(p.gridPosition.y - position.y);
        if (dx <= 1 && dy <= 1 && !(dx === 0 && dy === 0)) {
          standingEnemies++;
        }
      }
    });

    // 2. Delegate to Controller
    const result = this.pickupController.attemptPickup(player, standingEnemies);

    // 3. Handle Result
    if (!result.success) {
      // Bounce Logic handled by GameService usually for turn end?
      // Or should Manager do it?
      // The original code returned false and triggered turnover.
      // We should bounce the ball here too if we want MANAGER to manage ball.

      const bouncePos = this.movementController.bounce(position);
      this.state.ballPosition = bouncePos;

      this.eventBus.emit(GameEventNames.BallScattered, {
        from: position,
        to: bouncePos,
        reason: "Failed Pickup",
      });

      this.callbacks.onTurnover("Failed Pickup");
      return false;
    }

    return true;
  }

  public hasBall(playerId: string): boolean {
    // We don't have direct access to players list here trivially unless we search teams
    // But we usually call this from GameService which passes player ID.
    // Actually, checking if a player has the ball requires checking their position vs ball position.
    // We need to find the player first.

    // Optimization: If we trust the caller to check valid player, we just need coordinates.
    // But we only have ID.
    const p1 = this.team1.players.find((p) => p.id === playerId);
    const p2 = this.team2.players.find((p) => p.id === playerId);
    const player = p1 || p2;

    if (!player || !player.gridPosition || !this.state.ballPosition)
      return false;

    return (
      player.gridPosition.x === this.state.ballPosition.x &&
      player.gridPosition.y === this.state.ballPosition.y
    );
  }
}
