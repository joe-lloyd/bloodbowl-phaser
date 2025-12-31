import { IEventBus } from "../../services/EventBus";
import { GameEventNames } from "../../types/events";
import { Player } from "@/types/Player";
import { DiceController } from "./DiceController";

/**
 * PickupController
 *
 * Purpose: Encapsulates logic for a player attempting to pick up the ball from the ground.
 *
 * IN_SCOPE:
 * - attemptPickup(player): Calculates Agility target, tackle zone modifiers, weather modifiers.
 * - determining Success/Failure of the action.
 *
 * OUT_OF_SCOPE:
 * - Moving the player to the square.
 * - Handling the result of failure (Turnover/Bounce is orchestrated by BallManager based on this result).
 */
export class PickupController {
  constructor(
    private eventBus: IEventBus,
    private diceController: DiceController
  ) {}

  public attemptPickup(
    player: Player,
    standingEnemies: number,
    weatherModifier: number = 0
  ): { success: boolean; roll: number } {
    // 1. Calculate Target (AG)
    const target = player.stats.AG;

    // 2. Modifiers (-1 per Enemy Tackle Zone, +Weather)
    // Enemies are calculated by caller (usually BallManager or GameService) for purity
    const modifier = -standingEnemies + weatherModifier;

    // 3. Roll
    const d6 = this.diceController.rollD6("Agility (Pickup)");

    const finalRoll = d6 + modifier;
    const success = d6 !== 1 && (d6 === 6 || finalRoll >= target);

    this.eventBus.emit(GameEventNames.BallPickup, {
      playerId: player.id,
      success,
      roll: d6,
      target,
    });

    return { success, roll: d6 };
  }
}
