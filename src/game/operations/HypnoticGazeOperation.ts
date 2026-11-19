import { GameEventNames } from "../../types/events";
import { PlayerCondition, addCondition } from "../../types/Player";
import { SkillType } from "../../types/Skills";
import { type FlowContext } from "../core/GameFlowManager";
import { withRerollOffer } from "../skills";
import {
  AdjacentTargetOperation,
  type Duel,
  type Opening,
} from "./specialActionTarget";

export class HypnoticGazeOperation extends AdjacentTargetOperation {
  public readonly name = "HypnoticGazeOperation";
  protected readonly notAdjacent = "Target must be adjacent!";
  protected readonly finishName = "FinishHypnoticGaze";

  protected opening({ target }: Duel): Opening {
    return {
      skill: SkillType.HYPNOTIC_GAZE,
      effect: `Hypnotic Gaze: locking eyes with ${target.playerName}`,
    };
  }

  protected async resolve(
    context: FlowContext,
    { attacker, target, dice }: Duel
  ): Promise<void> {
    const { gameService, eventBus } = context;

    const check = await withRerollOffer(
      { gameService, eventBus },
      attacker,
      "gaze",
      () =>
        dice.rollSkillCheck(
          { reason: "Hypnotic Gaze",target: 3,modifier: 0,playerName: attacker.playerName,teamId: attacker.teamId }        )
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
  }
}
