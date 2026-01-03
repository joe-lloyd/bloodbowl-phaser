import { GameOperation } from "../core/GameOperation";
import { GameEventNames } from "../../types/events";
import { IGameService } from "../../services/interfaces/IGameService.js";
import { PlayerStatus } from "../../types/Player.js";
import { InjuryResult } from "../controllers/InjuryController.js";
import { CasualtyOperation } from "./CasualtyOperation.js";

/**
 * InjuryOperation
 *
 * Responsibility:
 * - Execute Injury Roll (2D6)
 * - Update Player Status (STUNNED, KO, CASUALTY)
 * - If CASUALTY, trigger CasualtyOperation
 */
export class InjuryOperation extends GameOperation {
  public readonly name = "InjuryOperation";

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
      `Injury Roll for ${player.playerName}`
    );

    // Suspense delay
    await new Promise((resolve) => setTimeout(resolve, 800));

    // 1. Roll 2D6 via DiceController
    const roll = gameService
      .getDiceController()
      .roll2D6(`Injury Roll (${player.playerName})`);

    // 2. Determine result
    const injuryController = gameService.getInjuryController();
    const result = injuryController.getInjuryResult(player, roll);

    // 3. Apply status
    switch (result) {
      case InjuryResult.STUNNED:
        eventBus.emit(GameEventNames.UI_Notification, "STUNNED!");
        player.status = PlayerStatus.STUNNED;
        break;
      case InjuryResult.KO:
        eventBus.emit(GameEventNames.UI_Notification, "KNOCKED OUT!");
        player.status = PlayerStatus.KO;
        break;
      case InjuryResult.CASUALTY:
        eventBus.emit(GameEventNames.UI_Notification, "CASUALTY!");
        player.status = PlayerStatus.INJURED;
        // Trigger Casualty Operation
        flowManager.add(new CasualtyOperation(this.playerId), true);
        break;
    }

    // Emit status change event (if exists) or just generic update
    // Assuming service or managers handle the actual removal from pitch if status is KO/INJURED
  }
}
