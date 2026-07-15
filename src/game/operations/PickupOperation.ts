import { GameOperation } from "../core/GameOperation";
import { GameEventNames } from "../../types/events";
import { IGameService } from "../../services/interfaces/IGameService";
import { BounceOperation } from "./BounceOperation";
import { AgilityTestOperation } from "./AgilityTestOperation";

/**
 * PickupOperation
 *
 * Responsibility:
 * - Handle a player attempting to pick up a ball from the ground.
 * - Calculate modifiers (Tackle Zones, Weather).
 * - Execute Agility Test.
 * - Handle Success (Ball Possession).
 * - Handle Failure (Turnover + Bounce).
 */
export class PickupOperation extends GameOperation {
  public readonly name = "PickupOperation";

  /** Set by execute(). Callers must read this rather than re-checking the
   * ball position: on a failure the bounce runs asynchronously in the flow
   * queue, so the ball may still sit on the pickup square when execute()
   * resolves. */
  public success: boolean = false;

  constructor(private playerId: string) {
    super();
  }

  async execute(context: any): Promise<void> {
    const gameService = context.gameService as IGameService;
    const eventBus =
      context.eventBus as import("../../services/EventBus").IEventBus;
    const flowManager = context.flowManager;

    const player = gameService.getPlayerById(this.playerId);
    if (!player || !player.gridPosition) return;

    console.log(
      `[PickupOperation] Player ${player.playerName} attempting pickup...`
    );

    // 1. Calculate Modifiers
    const catchController = gameService.getCatchController();
    const opponents = gameService.getOpponents(player.teamId);

    // Pickup formula: AG Roll + 1 (for pickup) - 1 per Enemy Tackle Zone
    const markingOpponents = catchController.countMarkingOpponents(
      player.gridPosition,
      opponents
    );
    const modifiers = 1 - markingOpponents; // +1 base modifier for pickup

    // TODO: Add weather modifier if applicable
    // const weatherMod = gameService.getWeatherModifier?.() || 0;
    // modifiers += weatherMod;

    // 2. Execute Agility Test
    const agilityTest = new AgilityTestOperation(
      this.playerId,
      "Pickup",
      player.stats.AG,
      modifiers
    );

    await agilityTest.execute(context);
    this.success = agilityTest.success;

    if (agilityTest.success) {
      // PICKUP SUCCESS
      eventBus.emit(GameEventNames.UI_Notification, "Pickup Successful!");

      // Update possession
      gameService.setBallPosition(player.gridPosition.x, player.gridPosition.y);

      // Emit legacy event for compatibility
      eventBus.emit(GameEventNames.BallPickup, {
        playerId: this.playerId,
        success: true,
        roll: agilityTest.roll,
        target: player.stats.AG,
      });

      // Picking the ball up while standing in the scoring end zone is a TD
      gameService.checkForTouchdown(this.playerId);
    } else {
      // PICKUP FAIL
      eventBus.emit(GameEventNames.UI_Notification, "Pickup Failed!");

      // Emit legacy event for compatibility
      eventBus.emit(GameEventNames.BallPickup, {
        playerId: this.playerId,
        success: false,
        roll: agilityTest.roll,
        target: player.stats.AG,
      });

      // Bounce ball from the current square
      flowManager.add(new BounceOperation(player.gridPosition), true);

      // Turnover!
      gameService.triggerTurnover("Failed Pickup");
    }
  }
}
