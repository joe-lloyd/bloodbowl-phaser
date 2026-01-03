import { GameOperation } from "../core/GameOperation";
import { GameEventNames } from "../../types/events";
import { IGameService } from "../../services/interfaces/IGameService";
import { FlowContext } from "../core/GameFlowManager";

/**
 * ArgueTheCallOperation
 *
 * Responsibility:
 * - Perform the D6 roll for "Argue the Call".
 * - Update GameState (coachesEjected) if coach is ejected.
 * - Set a flag in the context or emit an event for the result?
 *   Actually, it should probably add a success/fail flag to the context
 *   or be followed by another operation.
 */
export class ArgueTheCallOperation extends GameOperation {
  public readonly name = "ArgueTheCallOperation";

  constructor(private teamId: string) {
    super();
  }

  async execute(context: FlowContext): Promise<void> {
    const gameService = context.gameService as IGameService;
    const eventBus = context.eventBus;
    const foulController = gameService.getFoulController();
    const diceController = gameService.getDiceController();

    eventBus.emit(
      GameEventNames.UI_Notification,
      "Coach is Arguing the Call..."
    );

    // 1. Dice Roll
    const roll = diceController.rollD6("Argue the Call");
    const result = foulController.resolveArgueTheCall(roll);

    // 2. Handle Result
    if (result === "swayed") {
      eventBus.emit(
        GameEventNames.UI_Notification,
        "Referee is swayed! Player stays."
      );
      (context as any).argueSucceeded = true;
    } else if (result === "ejected") {
      eventBus.emit(GameEventNames.UI_Notification, "Coach is EJECTED!");
      gameService.getState().coachesEjected.push(this.teamId);
      (context as any).argueSucceeded = false;
    } else {
      eventBus.emit(
        GameEventNames.UI_Notification,
        "Referee ignores the argument."
      );
      (context as any).argueSucceeded = false;
    }

    await new Promise((resolve) => setTimeout(resolve, 800));
  }
}
