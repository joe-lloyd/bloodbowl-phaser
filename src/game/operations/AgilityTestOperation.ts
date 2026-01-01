import { GameOperation } from "../core/GameOperation";
import { GameEventNames } from "../../types/events";
import { IGameService } from "../../services/interfaces/IGameService";
import { Player } from "@/types/Player";

/**
 * AgilityTestOperation
 *
 * Performs a generic Agility Test (Catch, Dodge, Pickup, etc.)
 * Logic: Roll D6 + Modifiers >= Target
 * Handles Natural 1 (Fail) and Natural 6 (Success)
 */
export class AgilityTestOperation extends GameOperation {
  public readonly name = "AgilityTestOperation";
  public success: boolean = false; // Store result for caller inspection

  constructor(
    private playerId: string,
    private testName: string,
    private targetNumber: number,
    private modifiers: number,
    private description?: string
  ) {
    super();
  }

  async execute(context: any): Promise<void> {
    const gameService = context.gameService as IGameService;
    const eventBus =
      context.eventBus as import("../../services/EventBus").IEventBus;

    const player = gameService.getPlayerById(this.playerId);
    if (!player) return;

    // Display Notification
    const modString =
      this.modifiers >= 0 ? `+${this.modifiers}` : `${this.modifiers}`;
    const info = this.description || `${this.testName} Test`;
    eventBus.emit(
      GameEventNames.UI_Notification,
      `${info}: ${this.targetNumber}+ (Mod: ${modString})`
    );

    // Suspense delay
    await new Promise((resolve) => setTimeout(resolve, 800));

    // Execute Roll via DiceController
    const result = gameService
      .getDiceController()
      .rollSkillCheck(
        this.testName,
        this.targetNumber,
        this.modifiers,
        player.playerName
      );

    this.success = result.success;

    // We don't trigger "Turnover" or next steps here.
    // The CALLER (e.g. CatchOperation) should check `this.success` and decide what to do.
    // However, GameOperation execution is "fire and forget" in the queue usually?
    // The previous flow had CatchOperation adding BounceOperation on failure.
    // If AgilityTestOperation is a *sub-step*, how does CatchOperation know the result?
    // OPTION A: AgilityTestOperation is just a helper, CatchOperation calls it?
    // But Operations are usually async tasks in the queue.
    // If CatchOperation adds AgilityTestOperation to queue, it can't easily wait for it unless we structure it differently.
    //
    // The USER asked to "setup an AgilityTestOperation and call that when we need to".
    //
    // It seems the intention is to use it as a sub-routine OR a discrete step.
    // Given the current architecture, CatchOperation *is* the operation running.
    // It shouldn't necessarily "add" another operation for the test, but maybe *delegate* to it?
    // OR: CatchOperation executes, and *inside* execute, it creates and runs AgilityTestOperation manually?
    //
    // Let's implement it as a standard Operation, but designed to be instantiated and executed manually if needed,
    // OR we change the pattern so CatchOperation finishes, adds AgilityTest, which adds Success/Fail handler?
    //
    // Easier path: `AgilityTestFactory` or just helper method?
    // But user asked for `AgilityTestOperation`.
    //
    // Let's make it an Operation.
    // `CatchOperation` can instantiate it and call `execute` explicitly with the context?
    // `await new AgilityTestOperation(...).execute(context);`
    // This keeps it reusable.
  }
}
