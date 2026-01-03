import { GameOperation } from "../core/GameOperation";
import { GameEventNames } from "../../types/events";
import { IGameService } from "../../services/interfaces/IGameService.js";
import { InjuryType } from "../../types/Player.js";
import { CasualtyType } from "../controllers/InjuryController.js";

/**
 * CasualtyOperation
 *
 * Responsibility:
 * - Execute Casualty Roll (D16)
 * - Determine specific permanent injury
 * - Update player permanent state
 */
export class CasualtyOperation extends GameOperation {
  public readonly name = "CasualtyOperation";

  constructor(private playerId: string) {
    super();
  }

  async execute(context: any): Promise<void> {
    const gameService = context.gameService as IGameService;
    const eventBus =
      context.eventBus as import("../../services/EventBus").IEventBus;

    const player = gameService.getPlayerById(this.playerId);
    if (!player) return;

    eventBus.emit(
      GameEventNames.UI_Notification,
      `Casualty Roll for ${player.playerName}`
    );

    // Suspense delay
    await new Promise((resolve) => setTimeout(resolve, 800));

    // 1. Roll D16 via DiceController
    const roll = gameService
      .getDiceController()
      .rollD16(`Casualty Roll (${player.playerName})`);

    // 2. Determine result
    const injuryController = gameService.getInjuryController();
    const result = injuryController.getCasualtyResult(roll);

    eventBus.emit(GameEventNames.UI_Notification, `Result: ${result}`);

    // 3. Apply to player permanent injuries
    switch (result) {
      case CasualtyType.BADLY_HURT:
        player.injuries.push(InjuryType.BADLY_HURT);
        break;
      case CasualtyType.SERIOUSLY_HURT:
        player.injuries.push(InjuryType.MISS_NEXT_GAME);
        break;
      case CasualtyType.SERIOUS_INJURY:
        player.injuries.push(InjuryType.NIGGLING_INJURY);
        break;
      case CasualtyType.LASTING_INJURY:
        // For simplicity, pick a stat. Real logic would roll another D6 or similar.
        player.injuries.push(InjuryType.STAT_DECREASE_MA);
        break;
      case CasualtyType.DEAD:
        player.injuries.push(InjuryType.DEAD);
        break;
    }
  }
}
