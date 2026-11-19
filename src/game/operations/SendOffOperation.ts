import { GameOperation } from "../core/GameOperation";
import { GameEventNames } from "../../types/events";
import { type FlowContext } from "../core/GameFlowManager";
import { resolveSendOff } from "./refereeCall";

export class SendOffOperation extends GameOperation {
  public readonly name = "SendOffOperation";

  private playerId: string;
  private reason: string;
  constructor(playerId: string, reason: string) {
    super();
    this.playerId = playerId;
    this.reason = reason;
  }

  async execute(context: FlowContext): Promise<void> {
    const gameService = context.gameService;
    const eventBus = context.eventBus;
    const player = gameService.getPlayerById(this.playerId);

    if (!player) return;

    eventBus.emit(
      GameEventNames.UI_Notification,
      `REFEREE SPOTTED IT! ${player.playerName} is being sent off!`
    );

    if ((await resolveSendOff(context, player, "foul")) === "bribed") return;
    gameService.triggerTurnover(this.reason);
  }
}
