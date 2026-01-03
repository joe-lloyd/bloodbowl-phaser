import { GameOperation } from "../core/GameOperation";
import { GameEventNames } from "../../types/events";
import { IGameService } from "../../services/interfaces/IGameService";
import { PlayerStatus } from "../../types/Player";
import { FlowContext } from "../core/GameFlowManager";
import { ArgueTheCallOperation } from "./ArgueTheCallOperation";

/**
 * SendOffOperation
 *
 * Responsibility:
 * - Check if coach can argue.
 * - If so, potentially run ArgueTheCallOperation.
 * - Remove player if not saved by argument.
 * - Trigger turnover.
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
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const state = gameService.getState();
    const canArgue = !state.coachesEjected.includes(player.teamId);

    if (canArgue) {
      // In a real game, we'd ask the player here.
      // For now, we auto-argue if possible (simplified sequence).
      const argueOp = new ArgueTheCallOperation(player.teamId);
      await argueOp.execute(context);

      if ((context as any).argueSucceeded) {
        return; // Saved!
      }
    }

    // 1. Remove Player
    player.status = PlayerStatus.REMOVED;
    eventBus.emit(
      GameEventNames.UI_Notification,
      `${player.playerName} is removed from the pitch.`
    );

    // 2. Trigger Turnover
    gameService.triggerTurnover(this.reason);
  }
}
