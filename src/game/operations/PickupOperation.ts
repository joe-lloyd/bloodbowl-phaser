import { GameOperation } from "../core/GameOperation";
import { GameEventNames } from "../../types/events";
import { IGameService } from "../../services/interfaces/IGameService";
import { BounceOperation } from "./BounceOperation";
import { AgilityTestOperation } from "./AgilityTestOperation";
import {
  foldTrigger,
  gatherParticipants,
  adjacentStanding,
  PickupContext,
} from "../skills";

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

    let roll = 1;
    // Trigger point: rules may adjust the pickup (Big Hand, Extra Arms)
    // or auto-fail it (No Ball)
    const pickupCtx: PickupContext = {
      player,
      marking: markingOpponents,
      modifiers: 1 - markingOpponents, // +1 base modifier for pickup
      decisions: gameService.getDecisionService(),
      flow: flowManager,
      arbiter: gameService.getRerollArbiter(),
      triggers: [],
    };
    await foldTrigger(
      "onPickup",
      gatherParticipants(
        player,
        undefined,
        adjacentStanding(player.gridPosition, opponents)
      ),
      pickupCtx
    );
    pickupCtx.triggers.forEach((t) =>
      eventBus.emit(GameEventNames.SkillTriggered, t)
    );

    if (pickupCtx.autoFail) {
      eventBus.emit(GameEventNames.DiceRoll, {
        rollType: `Pickup (${player.playerName})`,
        diceType: "1d6",
        value: 1,
        total: 1,
        description: `Pickup (${player.playerName}): auto-fail`,
        resultState: "failure",
        teamId: player.teamId,
      });
      this.success = false;
      roll = 1;
    } else {
      // 2. Execute Agility Test
      const agilityTest = new AgilityTestOperation(
        this.playerId,
        "Pickup",
        player.stats.AG,
        pickupCtx.modifiers,
        undefined,
        "pickup" // failed pickups may offer a reroll (Sure Hands / team)
      );

      await agilityTest.execute(context);
      this.success = agilityTest.success;
      roll = agilityTest.roll;
    }

    if (this.success) {
      // PICKUP SUCCESS
      eventBus.emit(GameEventNames.UI_Notification, "Pickup Successful!");

      // Update possession
      gameService.setBallPosition(player.gridPosition.x, player.gridPosition.y);

      // Emit legacy event for compatibility
      eventBus.emit(GameEventNames.BallPickup, {
        playerId: this.playerId,
        success: true,
        roll,
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
        roll,
        target: player.stats.AG,
      });

      // Bounce ball from the current square
      flowManager.add(new BounceOperation(player.gridPosition), true);

      // Turnover!
      gameService.triggerTurnover("Failed Pickup");
    }
  }
}
