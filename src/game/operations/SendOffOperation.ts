import { GameOperation } from "../core/GameOperation";
import { GameEventNames } from "../../types/events";
import { IGameService } from "../../services/interfaces/IGameService";
import { FlowContext } from "../core/GameFlowManager";
import { ArgueTheCallOperation } from "./ArgueTheCallOperation";
import { movePlayerToBox } from "../rules/playerLocation";

/**
 * SendOffOperation
 *
 * Responsibility:
 * - Argue the Call (always worth it in Sevens: the coach is never ejected).
 * - Remove player if not saved by argument.
 * - Trigger turnover, whether or not the argument succeeded (rule M6).
 */
export class SendOffOperation extends GameOperation {
  public readonly name = "SendOffOperation";

  constructor(
    private playerId: string,
    private reason: string
  ) {
    super();
  }

  async execute(context: FlowContext): Promise<void> {
    const gameService = context.gameService as IGameService;
    const eventBus = context.eventBus;
    const player = gameService.getPlayerById(this.playerId);

    if (!player) return;

    eventBus.emit(
      GameEventNames.UI_Notification,
      `REFEREE SPOTTED IT! ${player.playerName} is being sent off!`
    );
    await context.delay(1000);

    const argueOp = new ArgueTheCallOperation();
    await argueOp.execute(context);

    // 1. Remove Player unless the argument saved them — through the single
    // location seam, so the pitch square is released as the sent-off
    // dugout entry is created and PlayerStatusChanged fires for the view.
    if (!argueOp.swayed) {
      movePlayerToBox(player, { box: "sent-off" }, eventBus);
      eventBus.emit(
        GameEventNames.UI_Notification,
        `${player.playerName} is removed from the pitch.`
      );
    }

    // 2. Trigger Turnover
    gameService.triggerTurnover(this.reason);
  }
}
