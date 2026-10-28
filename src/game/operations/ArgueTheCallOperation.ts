import { GameOperation } from "../core/GameOperation";
import { GameEventNames } from "../../types/events";
import { IGameService } from "../../services/interfaces/IGameService";
import { FlowContext } from "../core/GameFlowManager";

/**
 * ArgueTheCallOperation
 *
 * Responsibility:
 * - Perform the D6 roll for "Argue the Call" (Sevens rule M6): on a 5 or 6
 *   the referee is swayed. The coach is never ejected.
 * - Expose the result as `swayed` for the SendOffOperation that runs it.
 */
export class ArgueTheCallOperation extends GameOperation {
  public readonly name = "ArgueTheCallOperation";
  public swayed = false;

  async execute(context: FlowContext): Promise<void> {
    const gameService = context.gameService as IGameService;
    const eventBus = context.eventBus;
    const foulController = gameService.getFoulController();
    const diceController = gameService.getDiceController();

    eventBus.emit(
      GameEventNames.UI_Notification,
      "Coach is Arguing the Call..."
    );

    const roll = diceController.rollD6("Argue the Call");
    this.swayed = foulController.resolveArgueTheCall(roll) === "swayed";
    eventBus.emit(
      GameEventNames.UI_Notification,
      this.swayed
        ? "Referee is swayed! Player returns to their square."
        : "Referee ignores the argument."
    );

    await context.delay(800);
  }
}
