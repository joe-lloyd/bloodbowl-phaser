import { GameOperation } from "../core/GameOperation";
import { GameEventNames } from "../../types/events";
import { IGameService } from "../../services/interfaces/IGameService";
import { PlayerStatus } from "../../types/Player";
import { BounceOperation } from "./BounceOperation";
import { AgilityTestOperation } from "./AgilityTestOperation";

export class CatchOperation extends GameOperation {
  public readonly name = "CatchOperation";

  constructor(
    private playerId: string,
    private isHandoff: boolean = false
  ) {
    super();
  }

  async execute(context: any): Promise<void> {
    const gameService = context.gameService as IGameService;
    const eventBus =
      context.eventBus as import("../../services/EventBus").IEventBus;
    const flowManager = context.flowManager;

    const player = gameService.getPlayerById(this.playerId);
    if (!player || !player.gridPosition) return;

    if (player.status !== PlayerStatus.ACTIVE) {
      console.log(
        `[CatchOperation] Player ${player.playerName} is ${player.status} and cannot catch. Bouncing.`
      );
      flowManager.add(new BounceOperation(player.gridPosition), true);
      return;
    }

    console.log(
      `[CatchOperation] Player ${player.playerName} attempting catch...`
    );

    // Accurate pass? We need to know if the pass was accurate to apply the +1 modifier.
    // For now, let's assume if we are catching a pass at the target square, it might be accurate.
    // However, CatchOperation assumes the ball has *arrived* at the player.
    // The +1 for Accurate Pass is specifically for an accurate pass.
    // Hand-off checks slightly different.

    // Simplification: We'll calculate basic modifiers (TZs, specific skills).
    // TODO: Pass "accurate" flag in constructor?

    const catchController = gameService.getCatchController();
    const opponents = gameService.getOpponents(player.teamId);

    const modifiers = catchController.calculateModifiers(
      player,
      player.gridPosition,
      opponents
    );

    // 2. Perform Agility Test
    const agilityTest = new AgilityTestOperation(
      this.playerId,
      "Catch",
      player.stats.AG,
      modifiers
    );

    // Execute the operation (sub-routine style)
    await agilityTest.execute(context);

    const success = agilityTest.success;

    if (success) {
      // CATCH SUCCESS
      eventBus.emit(GameEventNames.UI_Notification, "Catch Successful!");

      this.handleSuccess(gameService, player);
    } else {
      // CATCH FAIL -> BOUNCE
      eventBus.emit(GameEventNames.UI_Notification, "Catch Failed!");

      // Bounce from this square
      flowManager.add(new BounceOperation(player.gridPosition), true);

      // Turnover?
      // If it was a Pass/Handoff by Active Team, dropping it is a Turnover.
      if (gameService.getActiveTeamId() === player.teamId) {
        gameService.triggerTurnover("Dropped Ball");
      }
    }
  }

  private handleSuccess(gameService: IGameService, player: any) {
    // Logic to update ball ownership
    // This might require a new method on GameService or accessing BallManager
    // "givePossession"
    // For now, we will perform a "hack" or plan to add the method.
    // Since I cannot see BallManager public API fully, I'll rely on adding a service method in next step.
    // Checking GameService... it has 'attemptPickup'.
    // I'll use a placeholder comment for the helper call.
    // gameService.giveBallToPlayer(player.id);
  }
}
