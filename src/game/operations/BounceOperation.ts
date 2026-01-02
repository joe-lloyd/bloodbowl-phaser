import { GameOperation } from "../core/GameOperation";
import { GameEventNames } from "../../types/events";
import { IGameService } from "../../services/interfaces/IGameService";
import { CatchOperation } from "./CatchOperation";
import { GameConfig } from "@/config/GameConfig";

export class BounceOperation extends GameOperation {
  public readonly name = "BounceOperation";

  constructor(private startPosition: { x: number; y: number }) {
    super();
  }

  async execute(context: any): Promise<void> {
    const gameService = context.gameService as IGameService;
    const eventBus =
      context.eventBus as import("../../services/EventBus").IEventBus;
    const flowManager = context.flowManager;

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

    await new Promise((resolve) => setTimeout(resolve, 500)); // Wait for bounce anim

    // 3. Validation
    // Check constraints (Out of bounds?)
    if (
      newX < 0 ||
      newX >= GameConfig.PITCH_WIDTH ||
      newY < 0 ||
      newY >= GameConfig.PITCH_HEIGHT
    ) {
      eventBus.emit(GameEventNames.UI_Notification, "Ball Out of Bounds!");
      gameService.triggerTurnover("Ball Out of Bounds");
      // Throw-in logic? For now just turnover/stop.
      return;
    }

    // 4. Update Ball Position
    gameService.setBallPosition(newX, newY);

    // 5. Landing Conflict?
    const playerAtSquare = gameService.getPlayerAt(newX, newY);

    if (playerAtSquare) {
      // Attempt Catch
      eventBus.emit(GameEventNames.UI_Notification, "Ball hits player!");
      flowManager.add(new CatchOperation(playerAtSquare.id), true);
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
