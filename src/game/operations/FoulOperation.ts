import { GameOperation } from "../core/GameOperation";
import { GameEventNames } from "../../types/events";
import { IGameService } from "../../services/interfaces/IGameService";
import { PlayerStatus } from "../../types/Player";
import { InjuryResult } from "../controllers/InjuryController";
import { FlowContext } from "../core/GameFlowManager";
import { SendOffOperation } from "./SendOffOperation";

/**
 * FoulOperation
 *
 * Responsibility:
 * - Orchestrate the Foul sequence:
 *   1. Calculate assists (using FoulValidator via FoulController)
 *   2. Roll Armour (via DiceController, resolving via FoulController)
 *   3. Roll Injury if broken (via DiceController)
 *   4. Handle Send-off (spawning SendOffOperation)
 */
export class FoulOperation extends GameOperation {
  public readonly name = "FoulOperation";

  constructor(
    private foulerId: string,
    private targetX: number,
    private targetY: number
  ) {
    super();
  }

  async execute(context: FlowContext): Promise<void> {
    const gameService = context.gameService as IGameService;
    const eventBus = context.eventBus;
    const foulController = gameService.getFoulController();
    const diceController = gameService.getDiceController();

    const fouler = gameService.getPlayerById(this.foulerId);
    const target = gameService.getPlayerAt(this.targetX, this.targetY);

    if (!fouler || !target) {
      console.error(
        `[FoulOperation] Target acquisition failed. Fouler: ${!!fouler}, Target: ${!!target} at ${this.targetX},${this.targetY}`
      );
      eventBus.emit(GameEventNames.UI_Notification, "Foul target missing!");
      return;
    }

    if (
      target.status !== PlayerStatus.PRONE &&
      target.status !== PlayerStatus.STUNNED
    ) {
      console.warn(
        `[FoulOperation] target ${target.playerName} is not Prone/Stunned (Status: ${target.status})`
      );
      eventBus.emit(
        GameEventNames.UI_Notification,
        "Target must be Prone or Stunned!"
      );
      return;
    }

    eventBus.emit(
      GameEventNames.UI_Notification,
      `${fouler.playerName} is fouling ${target.playerName}!`
    );

    // 1. Analyze Foul (Assists)
    const opponents = gameService.getOpponents(fouler.teamId);
    const team = gameService.getTeam(fouler.teamId);
    const allPlayers = [...(team?.players || []), ...opponents];

    const analysis = foulController.analyzeFoul(fouler, target, allPlayers);

    eventBus.emit(
      GameEventNames.UI_Notification,
      `Assists: +${analysis.offensiveAssists.length} Offensive, -${analysis.defensiveAssists.length} Defensive. Mod: ${analysis.modifier >= 0 ? "+" : ""}${analysis.modifier}`
    );

    await new Promise((resolve) => setTimeout(resolve, 1000));

    // 2. Armour Roll
    const armorResultRaw = diceController.rollArmorCheck(
      target.stats.AV - analysis.modifier,
      target.playerName,
      fouler.teamId
    );
    const armorResult = foulController.resolveArmourRoll(
      target,
      armorResultRaw.rolls,
      analysis.modifier
    );

    let spotted = armorResult.isNaturalDouble;

    if (armorResult.broken) {
      eventBus.emit(GameEventNames.UI_Notification, "ARMOUR BROKEN!");
      await new Promise((resolve) => setTimeout(resolve, 800));

      // 3. Injury Roll
      const injuryResultRaw = diceController.rollInjury(
        target.playerName,
        fouler.teamId
      );
      if (injuryResultRaw.rolls[0] === injuryResultRaw.rolls[1]) {
        spotted = true;
      }

      const injuryTotal = injuryResultRaw.total;
      const injuryController = gameService.getInjuryController();
      const result = injuryController.getInjuryResult(target, injuryTotal);

      // Apply Injury Status
      switch (result) {
        case InjuryResult.STUNNED:
          eventBus.emit(GameEventNames.UI_Notification, "STUNNED!");
          target.status = PlayerStatus.STUNNED;
          break;
        case InjuryResult.KO:
          eventBus.emit(GameEventNames.UI_Notification, "KNOCKED OUT!");
          target.status = PlayerStatus.KO;
          break;
        case InjuryResult.CASUALTY:
          eventBus.emit(GameEventNames.UI_Notification, "CASUALTY!");
          target.status = PlayerStatus.INJURED;
          break;
      }
    } else {
      eventBus.emit(GameEventNames.UI_Notification, "Armour Holds.");
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));

    // 4. Handle spotted / send-off
    if (spotted) {
      const sendOffOp = new SendOffOperation(
        fouler.id,
        "Player Sent Off for Fouling"
      );
      // Add to front of queue so it processes next
      context.flowManager.add(sendOffOp, true);
    }

    // Mark that a foul has been performed
    gameService.getState().turn.hasFouled = true;
  }
}
