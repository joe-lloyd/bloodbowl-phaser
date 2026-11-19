import { GameOperation } from "../core/GameOperation";
import { GameEventNames } from "../../types/events";
import {
  PlayerStatus,
  PlayerCondition,
  addCondition,
} from "../../types/Player";
import { SkillType } from "../../types/Skills";
import { type FlowContext } from "../core/GameFlowManager";

class FinishChompOperation extends GameOperation {
  public readonly name = "FinishChomp";

  private attackerId: string;
  constructor(attackerId: string) {
    super();
    this.attackerId = attackerId;
  }

  async execute(context: FlowContext): Promise<void> {
    context.gameService.finishActivation(this.attackerId);
  }
}

export class ChompOperation extends GameOperation {
  public readonly name = "ChompOperation";

  private attackerId: string;
  private targetId: string;
  constructor(attackerId: string, targetId: string) {
    super();
    this.attackerId = attackerId;
    this.targetId = targetId;
  }

  async execute(context: FlowContext): Promise<void> {
    const gameService = context.gameService;
    const eventBus = context.eventBus;
    const dice = gameService.getDiceController();

    const attacker = gameService.getPlayerById(this.attackerId);
    const target = gameService.getPlayerById(this.targetId);
    if (!attacker?.gridPosition || !target?.gridPosition) return;

    if (target.status !== PlayerStatus.ACTIVE) {
      eventBus.emit(GameEventNames.UI_Notification, "Target must be Standing!");
      return;
    }
    const dx = Math.abs(attacker.gridPosition.x - target.gridPosition.x);
    const dy = Math.abs(attacker.gridPosition.y - target.gridPosition.y);
    if (dx > 1 || dy > 1 || dx + dy === 0) {
      eventBus.emit(
        GameEventNames.UI_Notification,
        "Target must be Marked by the chomper!"
      );
      return;
    }

    eventBus.emit(GameEventNames.SkillTriggered, {
      playerId: attacker.id,
      skill: SkillType.MONSTROUS_MOUTH,
      effect: `Chomp: ${attacker.playerName} bites at ${target.playerName}`,
    });
    await context.delay(600);

    const check = dice.rollSkillCheck(
      { reason: "Chomp",target: 3,modifier: 0,playerName: attacker.playerName,teamId: attacker.teamId }    );
    if (check.success) {
      addCondition(target, PlayerCondition.CHOMPED, attacker.id);
      eventBus.emit(GameEventNames.SkillTriggered, {
        playerId: attacker.id,
        skill: SkillType.MONSTROUS_MOUTH,
        effect: `Chomp: ${target.playerName} is Chomped — pinned while Marked`,
      });
      eventBus.emit(GameEventNames.PlayerStatusChanged, target);
      eventBus.emit(
        GameEventNames.UI_Notification,
        `${target.playerName} is caught in the monstrous maw!`
      );
    } else {
      eventBus.emit(GameEventNames.UI_Notification, "The bite misses.");
    }

    context.flowManager.add(new FinishChompOperation(this.attackerId));
  }
}
