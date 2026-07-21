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

/** Ends the gazer's activation once the gaze has resolved. */
class FinishGazeOperation extends GameOperation {
  public readonly name = "FinishHypnoticGaze";

  constructor(private attackerId: string) {
    super();
  }

  async execute(context: FlowContext): Promise<void> {
    context.gameService.finishActivation(this.attackerId);
  }
}

/**
 * HypnoticGazeOperation (2025 rulebook p.129, Hypnotic Gaze trait)
 *
 * Declared as its own Special Action ("gaze"); the player may move first
 * but never after the gaze — the activation ends either way. Against an
 * adjacent Standing opposition player: roll a D6. On a 1-2 nothing
 * happens; on a 3+ the target becomes Distracted (no Tackle Zone until
 * next activated). Never a turnover.
 */
export class HypnoticGazeOperation extends GameOperation {
  public readonly name = "HypnoticGazeOperation";

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
      eventBus.emit(GameEventNames.UI_Notification, "Target must be adjacent!");
      return;
    }

    eventBus.emit(GameEventNames.SkillTriggered, {
      playerId: attacker.id,
      skill: SkillType.HYPNOTIC_GAZE,
      effect: `Hypnotic Gaze: locking eyes with ${target.playerName}`,
    });
    await context.delay(600);

    const check = dice.rollSkillCheck(
      "Hypnotic Gaze",
      3,
      0,
      attacker.playerName,
      attacker.teamId
    );
    if (check.success) {
      addCondition(target, PlayerCondition.DISTRACTED);
      eventBus.emit(GameEventNames.SkillTriggered, {
        playerId: attacker.id,
        skill: SkillType.HYPNOTIC_GAZE,
        effect: `Hypnotic Gaze: ${target.playerName} is Distracted`,
      });
      eventBus.emit(GameEventNames.PlayerStatusChanged, target);
      eventBus.emit(
        GameEventNames.UI_Notification,
        `${target.playerName} stares blankly...`
      );
    } else {
      eventBus.emit(
        GameEventNames.UI_Notification,
        `${target.playerName} shakes it off.`
      );
    }

    context.flowManager.add(new FinishGazeOperation(this.attackerId));
  }
}
