import { GameOperation } from "../core/GameOperation";
import type { FlowContext } from "../core/GameFlowManager";
import { GameEventNames } from "../../types/events";
import { type IGameService } from "../../services/interfaces/IGameService";
import { BounceOperation } from "./BounceOperation";
import { AgilityTestOperation } from "./AgilityTestOperation";
import { weatherEffects } from "../rules/weather";
import {
  foldTrigger,
  gatherParticipants,
  adjacentStanding,
  type PickupContext,
  withRerollOffer,
} from "../skills";
import { isSecuringBall } from "../rules/secureBall";

function pickupNotification(securing: boolean, success: boolean): string {
  if (securing) return success ? "Ball secured!" : "Failed to secure the ball!";
  return success ? "Pickup Successful!" : "Pickup Failed!";
}

export class PickupOperation extends GameOperation {
  public readonly name = "PickupOperation";

  public success = false;

  private playerId: string;
  constructor(playerId: string) {
    super();
    this.playerId = playerId;
  }

  async execute(context: FlowContext): Promise<void> {
    const gameService = context.gameService;
    const eventBus = context.eventBus;
    const flowManager = context.flowManager;

    const player = gameService.getPlayerById(this.playerId);
    if (!player?.gridPosition) return;

    console.log(
      `[PickupOperation] Player ${player.playerName} attempting pickup...`
    );

    const catchController = gameService.getCatchController();
    const opponents = gameService.getOpponents(player.teamId);

    const markingOpponents = catchController.countMarkingOpponents(
      player.gridPosition,
      opponents
    );

    let roll = 1;
    const securing = isSecuringBall(gameService.getState(), this.playerId);
    const weather = weatherEffects(gameService.getState().weather).ballHandling;

    const pickupCtx: PickupContext = {
      player,
      marking: markingOpponents,
      weather,
      agilityTest: !securing,
      modifiers: -markingOpponents + weather,
      decisions: gameService.getDecisionService(),
      flow: flowManager,
      arbiter: gameService.getRerollArbiter(),
      triggers: [],
    };
    await foldTrigger(
      "onPickup",
      gatherParticipants(
        player,
        undefined,
        adjacentStanding(player.gridPosition, opponents)
      ),
      pickupCtx
    );
    pickupCtx.triggers.forEach((t) => {
      eventBus.emit(GameEventNames.SkillTriggered, t);
    });

    if (pickupCtx.autoFail) {
      eventBus.emit(GameEventNames.DiceRoll, {
        rollType: `Pickup (${player.playerName})`,
        diceType: "1d6",
        value: 1,
        total: 1,
        description: `Pickup (${player.playerName}): auto-fail`,
        resultState: "failure",
        teamId: player.teamId,

        context: { automatic: true },
      });
      this.success = false;
      roll = 1;
    } else if (securing) {
      const check = await withRerollOffer(
        { gameService, eventBus },
        player,
        "pickup",
        () =>
          gameService
            .getDiceController()
            .rollSkillCheck(
              { reason: "Secure the Ball",target: 2,modifier: pickupCtx.modifiers,playerName: player.playerName }            ),
        { skillAllowed: false, rollName: "Secure the Ball" }
      );
      this.success = check.success;
      roll = check.roll;
    } else {
      const agilityTest = new AgilityTestOperation(
        this.playerId,
        "Pickup",
        player.stats.AG,
        pickupCtx.modifiers,
        undefined,
        "pickup"
      );

      await agilityTest.execute(context);
      this.success = agilityTest.success;
      roll = agilityTest.roll;
    }

    if (this.success) {
      eventBus.emit(
        GameEventNames.UI_Notification,
        pickupNotification(securing, true)
      );

      gameService.setBallPosition(player.gridPosition.x, player.gridPosition.y);

      eventBus.emit(GameEventNames.BallPickup, {
        playerId: this.playerId,
        success: true,
        roll,
        target: securing ? 2 : player.stats.AG,
      });

      gameService.checkForTouchdown(this.playerId);
    } else {
      eventBus.emit(
        GameEventNames.UI_Notification,
        pickupNotification(securing, false)
      );

      eventBus.emit(GameEventNames.BallPickup, {
        playerId: this.playerId,
        success: false,
        roll,
        target: securing ? 2 : player.stats.AG,
      });

      flowManager.add(new BounceOperation(player.gridPosition), true);

      gameService.triggerTurnover(
        securing ? "Failed Secure the Ball" : "Failed Pickup"
      );
    }
  }
}
