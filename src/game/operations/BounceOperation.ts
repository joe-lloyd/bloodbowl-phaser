import { GameOperation } from "../core/GameOperation";
import { GameEventNames } from "../../types/events";
import { type FlowContext } from "../core/GameFlowManager";
import { CatchOperation } from "./CatchOperation";
import { d8Offset, settleOffObstacle } from "../rules/ballFlight";
import { isOnPitch } from "../rules/pitchSquares";
import { activeRules } from "../variants/activeMatch";
import {
  awaitPresentation,
  nextPresentationId,
} from "../presentation/presentationGate";

const BOUNCE_PRESENTATION_TIMEOUT_MS = 6000;

export class BounceOperation extends GameOperation {
  public readonly name = "BounceOperation";

  private startPosition: { x: number; y: number };
  private kickoff: boolean;
  private bounces: number | undefined;
  constructor(
    startPosition: { x: number; y: number },

    kickoff = false,

    bounces?: number
  ) {
    super();
    this.startPosition = startPosition;
    this.kickoff = kickoff;
    this.bounces = bounces;
  }

  private bouncesLeft(context: FlowContext): number {
    if (this.bounces !== undefined) return this.bounces;
    const { x, y } = this.startPosition;
    const onAPlayer = context.gameService.getPlayerAt(x, y) !== undefined;
    return Math.max(activeRules().ballBounces, onAPlayer ? 1 : 0);
  }

  async execute(context: FlowContext): Promise<void> {
    const { gameService, eventBus, flowManager } = context;

    const bounces = this.bouncesLeft(context);
    if (bounces === 0) {
      gameService.setBallPosition(this.startPosition.x, this.startPosition.y);
      eventBus.emit(GameEventNames.BallPlaced, { ...this.startPosition });
      return;
    }

    const direction = gameService
      .getDiceController()
      .rollD8("Bounce Direction");

    const offset = d8Offset(direction);
    const bounced = {
      x: this.startPosition.x + offset.x,
      y: this.startPosition.y + offset.y,
    };
    const { x: newX, y: newY } = isOnPitch(bounced)
      ? settleOffObstacle(gameService.getDiceController(), bounced)
      : bounced;

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

    if (!isOnPitch(bounced)) {
      eventBus.emit(GameEventNames.UI_Notification, "Ball Out of Bounds!");
      gameService.throwInBall(this.startPosition, bounced, this.kickoff);
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
    } else if (bounces > 1) {
      flowManager.add(
        new BounceOperation({ x: newX, y: newY }, this.kickoff, bounces - 1),
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
