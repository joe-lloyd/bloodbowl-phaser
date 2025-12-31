import { IEventBus } from "../../services/EventBus";
import { GameEventNames } from "../../types/events";
import { BallMovementController } from "./BallMovementController";
import { WeatherManager } from "../managers/WeatherManager";
import { DiceController } from "./DiceController";
import { GameConfig } from "@/config/GameConfig";

/**
 * KickoffController
 *
 * Purpose: Encapsulates all logic specific to the Kickoff sequence.
 *
 * IN_SCOPE:
 * - rollKickoffEvent(): Handles the 2d6 Kickoff Table events.
 * - calculateKickDestination(): Uses BallMovementController.deviate to find where the ball lands.
 * - Determining if the ball lands out of bounds (Touchback logic).
 *
 * OUT_OF_SCOPE:
 * - Placing the ball on the pitch (Calls BallManager to update state).
 * - Managing weather effects (Queries WeatherManager, doesn't own it).
 */
export class KickoffController {
  constructor(
    private eventBus: IEventBus,
    private movementController: BallMovementController,
    private weatherManager: WeatherManager,
    private diceController: DiceController
  ) {}

  public rollKickoffEvent(): { roll: number; event: string } {
    const roll = this.diceController.roll2D6("Kickoff Event");
    let event = "Changing Weather";

    switch (roll) {
      case 2:
        event = "Get the Ref!";
        break;
      case 3:
        event = "Riot!";
        break;
      case 4:
        event = "Perfect Defense";
        break;
      case 5:
        event = "High Kick";
        break;
      case 6:
        event = "Cheering Fans";
        break;
      case 7:
        event = "Changing Weather";
        this.weatherManager.rollWeather();
        break;
      case 8:
        event = "Brilliant Coaching";
        break;
      case 9:
        event = "Quick Snap!";
        break;
      case 10:
        event = "Blitz!";
        break;
      case 11:
        event = "Throw a Rock";
        break;
      case 12:
        event = "Pitch Invasion!";
        break;
    }

    // DiceController already checks passed/failed? 2d6 is just a roll.
    // We emit the KickoffResult event for logic handling.
    this.eventBus.emit(GameEventNames.KickoffResult, { roll, event });

    return { roll, event };
  }

  public calculateKickDestination(
    targetX: number,
    targetY: number,
    isTeam1Kicking: boolean
  ): {
    finalX: number;
    finalY: number;
    isTouchback: boolean;
  } {
    const finalPosition = this.movementController.deviate({
      x: targetX,
      y: targetY,
    });

    const isOffPitch =
      finalPosition.x < 1 ||
      finalPosition.x > GameConfig.PITCH_WIDTH ||
      finalPosition.y < 0 ||
      finalPosition.y > GameConfig.PITCH_HEIGHT;

    const isOwnThird = isTeam1Kicking
      ? finalPosition.x < 7
      : finalPosition.x > 13;

    const isTouchback = isOffPitch || isOwnThird;

    return {
      finalX: finalPosition.x,
      finalY: finalPosition.y,
      isTouchback,
    };
  }
}
