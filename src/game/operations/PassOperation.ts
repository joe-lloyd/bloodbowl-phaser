import { GameOperation } from "../core/GameOperation";
import { GameEventNames } from "../../types/events";
import { IGameService } from "../../services/interfaces/IGameService";
import { BounceOperation } from "./BounceOperation";
import { CatchOperation } from "./CatchOperation";

/**
 * PassOperation
 *
 * Responsibility:
 * - Execute the "Pass" sequence:
 *   1. Calculate modifiers (using Controller)
 *   2. Roll accuracy
 *   3. Animate ball flight (via events)
 *   4. Determine landing spot (or scatter)
 *   5. Trigger next operation (Catch or Bounce)
 */
export class PassOperation extends GameOperation {
  public readonly name = "PassOperation";

  constructor(
    private passerId: string,
    private targetX: number,
    private targetY: number
  ) {
    super();
  }

  async execute(context: any): Promise<void> {
    const gameService = context.gameService as IGameService;
    const eventBus =
      context.eventBus as import("../../services/EventBus").IEventBus;

    const passer = gameService.getPlayerById(this.passerId);
    if (!passer || !passer.gridPosition) return;

    console.log(
      `[PassOperation] Executing pass from ${passer.id} to ${this.targetX},${this.targetY}`
    );

    // 1. Calculate Result (Logic delegated to Controller)
    // We assume PassController is pure calculation helper now
    const passController = gameService.getPassController();
    const catchController = gameService.getCatchController();

    const opponents = gameService.getOpponents(passer.teamId); // Helper needed on service?
    // Calculate marking opponents (Zones of Control)
    const markingOpponents = catchController.countMarkingOpponents(
      passer.gridPosition,
      opponents
    );

    const result = passController.attemptPass(
      passer,
      passer.gridPosition,
      { x: this.targetX, y: this.targetY },
      markingOpponents
    );

    // 2. Emit Animation Events
    eventBus.emit(GameEventNames.PassAttempted, {
      playerId: this.passerId,
      from: passer.gridPosition,
      to: { x: this.targetX, y: this.targetY },
      passType: result.passType,
      accurate: !result.fumbled && result.success, // Simplified
      finalPosition: result.finalPosition,
      scatterPath: result.scatterPath,
    });

    // 3. Wait for Animation (Simulated)
    // Ideally we listen for "BallAnimationComplete" or just wait fixed time
    await new Promise((resolve) => setTimeout(resolve, 1500));

    // 4. Handle Outcome
    if (result.fumbled) {
      eventBus.emit(GameEventNames.UI_Notification, "FUMBLE!");
      // Fumbled = Drops in passer's square, then bounces
      // Update ball pos to passer first
      if (passer.gridPosition) {
        gameService.setBallPosition(
          passer.gridPosition.x,
          passer.gridPosition.y
        );
        context.flowManager.add(new BounceOperation(passer.gridPosition), true);
      }
      gameService.triggerTurnover("Fumbled Pass");
    } else {
      // Pass flew somewhere (Accurate OR Inaccurate)
      // Pass logic already determined 'finalPosition' (target or scattered)
      const landingPos = result.finalPosition;

      if (result.success) {
        eventBus.emit(GameEventNames.UI_Notification, "Accurate Pass!");
      } else {
        eventBus.emit(GameEventNames.UI_Notification, "Inaccurate Pass!");
        // If inaccurate, it counts as a turnover?
        // Rule: "If the pass was not accurate... turnover unless caught by a teammate"
        // Turnover logic should probably wait until the ball settles?
        // Actually, "A failed Pass is a Turnover... unless the ball is caught by a player from the moving team"
        // So we trigger 'Pass Missed' turnover LATER if catch fails?
        // For now, let's let the recursive logic run. If it lands empty -> Turnover.
      }

      // Update ball position to landing spot
      (gameService as any).setBallPosition(landingPos.x, landingPos.y);

      // Check landing
      const playerAtLanding = gameService.getPlayerAt(
        landingPos.x,
        landingPos.y
      );

      if (playerAtLanding) {
        // Attempt Catch
        context.flowManager.add(new CatchOperation(playerAtLanding.id), true);
      } else {
        // Land in empty square -> Bounce
        eventBus.emit(
          GameEventNames.UI_Notification,
          "Ball Lands in Empty Square"
        );
        context.flowManager.add(new BounceOperation(landingPos), true);

        // If accurate pass lands empty -> Bounce -> Stop. Turnover?
        // "If the ball is not caught, it is a Turnover."
        gameService.triggerTurnover("Pass Incomplete");
      }
    }

    // Update State
    gameService.getState().ballPosition = result.finalPosition;
  }
}
