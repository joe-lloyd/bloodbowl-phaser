import { GameOperation } from "../core/GameOperation";
import { GameEventNames } from "../../types/events";
import { type FlowContext } from "../core/GameFlowManager";
import { CatchOperation } from "./CatchOperation";
import { GameConfig } from "@/config/GameConfig";
import {
  awaitPresentation,
  nextPresentationId,
} from "../presentation/presentationGate";

const BOUNCE_PRESENTATION_TIMEOUT_MS = 6000;

export class BounceOperation extends GameOperation {
  public readonly name = "BounceOperation";

  private startPosition: { x: number; y: number };
  private kickoff: boolean;
  constructor(
    startPosition: { x: number; y: number },

    kickoff = false
  ) {
    super();
    this.startPosition = startPosition;
    this.kickoff = kickoff;
  }

  async execute(context: FlowContext): Promise<void> {
    const { gameService, eventBus, flowManager } = context;

    const direction = gameService
      .getDiceController()
      .rollD8("Bounce Direction");

    const scatterTemplate: Record<number, { x: number; y: number }> = {
      1: { x: -1, y: -1 },
      2: { x: 0, y: -1 },
      3: { x: 1, y: -1 },
      4: { x: -1, y: 0 },
      5: { x: 1, y: 0 },
      6: { x: -1, y: 1 },
      7: { x: 0, y: 1 },
      8: { x: 1, y: 1 },
    };

    const offset = scatterTemplate[direction];
    const newX = this.startPosition.x + offset.x;
    const newY = this.startPosition.y + offset.y;

    console.log(
      `[BounceOperation] Bouncing from ${String(this.startPosition.x)},${String(this.startPosition.y)} to ${String(newX)},${String(newY)}`
    );

    const presentationId = nextPresentationId("bounce");

    const shown = awaitPresentation(
      eventBus,
      context.delay,
      presentationId,
      BOUNCE_PRESENTATION_TIMEOUT_MS
    );
    eventBus.emit(GameEventNames.PassFumbled, {
      playerId: "bounce",
      position: this.startPosition,
      bouncePosition: { x: newX, y: newY },
      presentationId,
    });
    await shown;

    if (
      this.kickoff &&
      gameService.kickoffBounceTouchback({ x: newX, y: newY })
    ) {
      return;
    }

    if (
      newX < 0 ||
      newX >= GameConfig.PITCH_WIDTH ||
      newY < 0 ||
      newY >= GameConfig.PITCH_HEIGHT
    ) {
      eventBus.emit(GameEventNames.UI_Notification, "Ball Out of Bounds!");
      gameService.throwInBall(this.startPosition);
      return;
    }

    gameService.setBallPosition(newX, newY);

    const playerAtSquare = gameService.getPlayerAt(newX, newY);

    if (playerAtSquare) {
      eventBus.emit(GameEventNames.UI_Notification, "Ball hits player!");
      flowManager.add(
        new CatchOperation(playerAtSquare.id, {
          origin: "bounce",
          kickoff: this.kickoff,
        }),
        true
      );
    } else {
      eventBus.emit(
        GameEventNames.UI_Notification,
        "Ball lands in empty square."
      );
      eventBus.emit(GameEventNames.BallPlaced, { x: newX, y: newY });
    }
  }
}
