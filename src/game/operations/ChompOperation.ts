import { GameEventNames } from "../../types/events";
import { PlayerCondition, addCondition } from "../../types/Player";
import { SkillType } from "../../types/Skills";
import { type FlowContext } from "../core/GameFlowManager";
import {
  AdjacentTargetOperation,
  type Duel,
  type Opening,
} from "./specialActionTarget";

export class ChompOperation extends AdjacentTargetOperation {
  public readonly name = "ChompOperation";
  protected readonly notAdjacent = "Target must be Marked by the chomper!";
  protected readonly finishName = "FinishChomp";

  protected opening({ attacker, target }: Duel): Opening {
    return {
      skill: SkillType.MONSTROUS_MOUTH,
      effect: `Chomp: ${attacker.playerName} bites at ${target.playerName}`,
    };
  }

  protected resolve(
    { eventBus }: FlowContext,
    { attacker, target, dice }: Duel
  ): void {

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
  }
}
