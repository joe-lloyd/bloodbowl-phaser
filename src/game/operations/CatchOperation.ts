import { GameOperation } from "../core/GameOperation";
import { GameEventNames } from "../../types/events";
import { FlowContext } from "../core/GameFlowManager";
import { PlayerStatus } from "../../types/Player";
import { BounceOperation } from "./BounceOperation";
import { AgilityTestOperation } from "./AgilityTestOperation";
import {
  foldTrigger,
  gatherParticipants,
  adjacentStanding,
  playersWithin,
  CatchContext,
} from "../skills";

export class CatchOperation extends GameOperation {
  public readonly name = "CatchOperation";

  constructor(
    private playerId: string,
    /**
     * Only a dropped pass/hand-off is a turnover; a dropped bounce or
     * throw-in is not (the original loss already caused one if due).
     */
    private turnoverOnDrop: boolean = true,
    private options: {
      origin?: "pass" | "handoff" | "throw-in" | "kick-off" | "bounce";
      isPassTarget?: boolean;
      divingCatch?: boolean;
      landingPosition?: { x: number; y: number };
    } = {}
  ) {
    super();
  }

  async execute(context: FlowContext): Promise<void> {
    const { gameService, eventBus, flowManager } = context;

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

    const marking = catchController.countMarkingOpponents(
      player.gridPosition,
      opponents
    );
    const modifiers = catchController.calculateModifiers(
      player,
      player.gridPosition,
      opponents
    );

    // Trigger point: rules may adjust the catch (Extra Arms, Nerves of
    // Steel) or auto-fail it (No Ball)
    const catchCtx: CatchContext = {
      player,
      marking,
      modifiers,
      origin: this.options.origin,
      isPassTarget: this.options.isPassTarget,
      divingCatch: this.options.divingCatch,
      decisions: gameService.getDecisionService(),
      flow: flowManager,
      arbiter: gameService.getRerollArbiter(),
      triggers: [],
    };
    await foldTrigger(
      "onCatch",
      gatherParticipants(player, undefined, [
        ...adjacentStanding(player.gridPosition, opponents),
        // Aura skills (Disturbing Presence) reach 3 squares, any status
        ...playersWithin(player.gridPosition, opponents, 3),
      ]),
      catchCtx
    );
    catchCtx.triggers.forEach((t) =>
      eventBus.emit(GameEventNames.SkillTriggered, t)
    );

    let success = false;
    if (!catchCtx.autoFail) {
      // 2. Perform Agility Test
      const agilityTest = new AgilityTestOperation(
        this.playerId,
        "Catch",
        player.stats.AG,
        catchCtx.modifiers,
        undefined,
        "catch" // failed catches may offer a reroll (Catch skill / team)
      );

      // Execute the operation (sub-routine style)
      await agilityTest.execute(context);
      success = agilityTest.success;
    }

    if (success) {
      if (this.options.divingCatch && player.gridPosition) {
        gameService.setBallPosition(
          player.gridPosition.x,
          player.gridPosition.y
        );
      }
      // CATCH SUCCESS (possession is positional: ball is on their square)
      eventBus.emit(GameEventNames.UI_Notification, "Catch Successful!");

      // Catching in the scoring end zone is an immediate touchdown
      gameService.checkForTouchdown(this.playerId);
    } else {
      // CATCH FAIL -> BOUNCE
      eventBus.emit(GameEventNames.UI_Notification, "Catch Failed!");

      // Bounce from this square
      flowManager.add(
        new BounceOperation(
          this.options.landingPosition ?? player.gridPosition
        ),
        true
      );

      // Turnover?
      // If it was a Pass/Handoff by Active Team, dropping it is a Turnover.
      if (
        this.turnoverOnDrop &&
        gameService.getActiveTeamId() === player.teamId
      ) {
        gameService.triggerTurnover("Dropped Ball");
      }
    }
  }
}
