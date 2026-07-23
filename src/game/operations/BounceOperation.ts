import { GameOperation } from "../core/GameOperation";
import { GameEventNames } from "../../types/events";
import { FlowContext } from "../core/GameFlowManager";
import { CatchOperation } from "./CatchOperation";
import { GameConfig } from "@/config/GameConfig";

export class BounceOperation extends GameOperation {
  public readonly name = "BounceOperation";

  constructor(private startPosition: { x: number; y: number }) {
    super();
  }

  async execute(context: FlowContext): Promise<void> {
    const { gameService, eventBus, flowManager } = context;

    // 1. Roll Scatter (d8)
    const direction = gameService
      .getDiceController()
      .rollD8("Bounce Direction");

    const scatterTemplate: { [key: number]: { x: number; y: number } } = {
      1: { x: -1, y: -1 }, // Top-Left
      2: { x: 0, y: -1 }, // Top
      3: { x: 1, y: -1 }, // Top-Right
      4: { x: -1, y: 0 }, // Left
      5: { x: 1, y: 0 }, // Right
      6: { x: -1, y: 1 }, // Bottom-Left
      7: { x: 0, y: 1 }, // Bottom
      8: { x: 1, y: 1 }, // Bottom-Right
    };

    const offset = scatterTemplate[direction];
    const newX = this.startPosition.x + offset.x;
    const newY = this.startPosition.y + offset.y;

    console.log(
      `[BounceOperation] Bouncing from ${this.startPosition.x},${this.startPosition.y} to ${newX},${newY}`
    );

    // 2. Animate Bounce
    eventBus.emit(GameEventNames.PassFumbled, {
      playerId: "bounce", // Dummy
      position: this.startPosition,
      bouncePosition: { x: newX, y: newY },
    });

    await context.delay(200); // Wait for bounce anim

    // 3. Validation
    // Check constraints (Out of bounds?)
    if (
      newX < 0 ||
      newX >= GameConfig.PITCH_WIDTH ||
      newY < 0 ||
      newY >= GameConfig.PITCH_HEIGHT
    ) {
      // The crowd throws a bounced-out ball back in from the square it
      // left (p.73); bouncing out is not itself a turnover
      eventBus.emit(GameEventNames.UI_Notification, "Ball Out of Bounds!");
      gameService.throwInBall(this.startPosition);
      return;
    }

    // 4. Update Ball Position
    gameService.setBallPosition(newX, newY);

    // 5. Landing Conflict?
    const playerAtSquare = gameService.getPlayerAt(newX, newY);

    if (playerAtSquare) {
      // Attempt Catch (a dropped bounce is not a turnover by itself)
      eventBus.emit(GameEventNames.UI_Notification, "Ball hits player!");
      flowManager.add(
        new CatchOperation(playerAtSquare.id, false, { origin: "bounce" }),
        true
      );
    } else {
      // Land in empty square
      eventBus.emit(
        GameEventNames.UI_Notification,
        "Ball lands in empty square."
      );
      eventBus.emit(GameEventNames.BallPlaced, { x: newX, y: newY });

      // End of chain.
      // If this was a dropped pass turnover, the turn ends.
      // If it was kickoff, maybe touchback or play starts?
      // Context matters.
    }
  }
}
