import { BallMovementController } from "./BallMovementController";
import { DiceController } from "./DiceController";
import { GameConfig } from "@/config/GameConfig";
import { KICKOFF_TABLE, KickoffEvent } from "../kickoff/kickoffEvents";

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
  private movementController: BallMovementController;
  private diceController: DiceController;

  constructor(
    movementController: BallMovementController,
    diceController: DiceController
  );
  /** Compatibility overload for callers using the controller's former shape. */
  constructor(
    eventBus: unknown,
    movementController: BallMovementController,
    weatherManager: unknown,
    diceController: DiceController
  );
  constructor(
    movementOrEventBus: BallMovementController | unknown,
    diceOrMovement: DiceController | BallMovementController,
    _weatherManager?: unknown,
    legacyDiceController?: DiceController
  ) {
    if (legacyDiceController) {
      this.movementController = diceOrMovement as BallMovementController;
      this.diceController = legacyDiceController;
    } else {
      this.movementController = movementOrEventBus as BallMovementController;
      this.diceController = diceOrMovement as DiceController;
    }
  }

  /**
   * Roll the Blood Bowl Sevens table. State-changing resolution is owned by
   * KickoffEventManager; this controller retains the pure table-roll seam.
   */
  public rollKickoffEvent(): { roll: number; event: KickoffEvent } {
    const roll = this.diceController.roll2D6("Kickoff Event");
    return { roll, event: KICKOFF_TABLE[roll] };
  }

  public calculateKickDestination(
    targetX: number,
    targetY: number,
    isTeam1Kicking: boolean,
    /** The kicker has the Kick skill: deviate only D3 squares. */
    useKickD3 = false
  ): {
    finalX: number;
    finalY: number;
    isTouchback: boolean;
  } {
    const finalPosition = this.movementController.deviate(
      {
        x: targetX,
        y: targetY,
      },
      useKickD3
    );

    const isOffPitch =
      finalPosition.x < 0 ||
      finalPosition.x >= GameConfig.PITCH_WIDTH ||
      finalPosition.y < 0 ||
      finalPosition.y >= GameConfig.PITCH_HEIGHT;

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
