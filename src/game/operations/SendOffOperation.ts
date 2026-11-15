import { GameOperation } from "../core/GameOperation";
import { GameEventNames } from "../../types/events";
import { IGameService } from "../../services/interfaces/IGameService";
import { FlowContext } from "../core/GameFlowManager";
import { resolveSendOff } from "./refereeCall";

/**
 * SendOffOperation
 *
 * Responsibility:
 * - Send-off a spotted fouler: Argue the Call, then any Bribe
 *   (resolveSendOff).
 * - Trigger a Turnover, whether or not the argument succeeded (rule M6),
 *   unless a Bribe worked.
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

    // A Bribe that works keeps the player on and causes no Turnover.
    if ((await resolveSendOff(context, player, "foul")) === "bribed") return;
    gameService.triggerTurnover(this.reason);
  }
}
