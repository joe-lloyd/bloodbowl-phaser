import { GameOperation } from "../core/GameOperation";
import { GameEventNames } from "../../types/events";
import { IGameService } from "../../services/interfaces/IGameService.js";
import { InjuryOperation } from "./InjuryOperation.js";
import {
  foldTrigger,
  gatherParticipants,
  adjacentStanding,
  ArmourBreakContext,
} from "../skills";

/**
 * ArmourOperation
 *
 * Responsibility:
 * - Execute Armour Roll (2D6)
 * - If successful (Broken), trigger InjuryOperation
 */
export class ArmourOperation extends GameOperation {
  public readonly name = "ArmourOperation";

  constructor(private playerId: string) {
    super();
  }

  async execute(context: any): Promise<void> {
    const gameService = context.gameService as IGameService;
    const eventBus =
      context.eventBus as import("../../services/EventBus").IEventBus;
    const flowManager = context.flowManager;

    const player = gameService.getPlayerById(this.playerId);
    if (!player) return;

    eventBus.emit(
      GameEventNames.UI_Notification,
      `Armour Roll for ${player.playerName} (AV ${player.stats.AV}+)`
    );

    // Suspense delay
    await context.delay(800);

    // 1. Roll 2D6 via DiceController
    const roll = gameService
      .getDiceController()
      .roll2D6(`Armour Roll (${player.playerName})`);

    // 2. Check if broken; trigger point: rules may adjust the outcome
    const ctx: ArmourBreakContext = {
      player,
      roll,
      broken: gameService.getArmourController().isArmourBroken(player, roll),
      decisions: gameService.getDecisionService(),
      flow: flowManager,
      triggers: [],
    };
    await foldTrigger(
      "onArmourBreak",
      gatherParticipants(
        player,
        undefined,
        player.gridPosition
          ? adjacentStanding(
              player.gridPosition,
              gameService.getOpponents(player.teamId)
            )
          : []
      ),
      ctx
    );
    ctx.triggers.forEach((t) =>
      eventBus.emit(GameEventNames.SkillTriggered, t)
    );
    const isBroken = ctx.broken;

    if (isBroken) {
      eventBus.emit(GameEventNames.UI_Notification, "ARMOUR BROKEN!");
      await context.delay(600);

      // 3. Trigger Injury Operation
      flowManager.add(new InjuryOperation(this.playerId), true);
    } else {
      eventBus.emit(GameEventNames.UI_Notification, "Armour Holds.");
    }
  }
}
