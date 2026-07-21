import { GameOperation } from "../core/GameOperation";
import { GameEventNames } from "../../types/events";
import { IGameService } from "../../services/interfaces/IGameService";
import {
  PlayerStatus,
  PlayerCondition,
  addCondition,
} from "../../types/Player";
import { SkillType } from "../../types/Skills";
import { FlowContext } from "../core/GameFlowManager";

/** Ends the chomper's activation once the bite has resolved. */
class FinishChompOperation extends GameOperation {
  public readonly name = "FinishChomp";

  constructor(private attackerId: string) {
    super();
  }

  async execute(context: FlowContext): Promise<void> {
    context.gameService.finishActivation(this.attackerId);
  }
}

/**
 * ChompOperation (2025 rulebook p.131, Monstrous Mouth's Chomp Special
 * Action)
 *
 * Against a Standing opposition player this player is Marking: roll a D6.
 * On a 1-2 nothing happens; on a 3+ the target is Chomped — they cannot
 * leave their square while this player remains Marking them (the condition
 * and its expiry live in the engine: see PlayerCondition.CHOMPED). May
 * replace the Block Action of a Blitz. Never a turnover.
 */
export class ChompOperation extends GameOperation {
  public readonly name = "ChompOperation";

  constructor(
    private attackerId: string,
    private targetId: string
  ) {
    super();
  }

  async execute(context: FlowContext): Promise<void> {
    const gameService = context.gameService as IGameService;
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
      "Chomp",
      3,
      0,
      attacker.playerName,
      attacker.teamId
    );
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
