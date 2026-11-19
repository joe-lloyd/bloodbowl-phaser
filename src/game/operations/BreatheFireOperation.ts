import { GameEventNames } from "../../types/events";
import { PlayerStatus } from "../../types/Player";
import { SkillType } from "../../types/Skills";
import { type FlowContext } from "../core/GameFlowManager";
import { ArmourOperation } from "./ArmourOperation";
import { bounceIfBallUnder, knockDownPlayer } from "./knockDown";
import {
  AdjacentTargetOperation,
  type Duel,
  type Opening,
} from "./specialActionTarget";

export class BreatheFireOperation extends AdjacentTargetOperation {
  public readonly name = "BreatheFireOperation";
  protected readonly notAdjacent = "Target must be Marked by the breather!";
  protected readonly finishName = "FinishBreatheFire";

  protected opening({ target }: Duel): Opening {
    return {
      skill: SkillType.BREATHE_FIRE,
      effect: `Breathe Fire: a gout of flame at ${target.playerName}`,
    };
  }

  protected resolve(
    context: FlowContext,
    { attacker, target, dice }: Duel
  ): void {
    const { gameService, eventBus } = context;

    const strong = target.stats.ST >= 5;
    const check = dice.rollSkillCheck(
      { reason: "Breathe Fire",target: 4,modifier: strong? -1:0,playerName: attacker.playerName,teamId: attacker.teamId }    );

    if (check.roll === 1) {
      eventBus.emit(GameEventNames.UI_Notification, "The flame washes back!");
      knockDownPlayer(eventBus, attacker);
      bounceIfBallUnder(context, attacker);
      context.flowManager.add(new ArmourOperation(attacker.id), true);
      gameService.triggerTurnover("Knocked Down by their own fire");
    } else if (check.roll === 6) {
      eventBus.emit(GameEventNames.UI_Notification, "ENGULFED!");
      knockDownPlayer(eventBus, target);
      bounceIfBallUnder(context, target);
      context.flowManager.add(
        new ArmourOperation(target.id, attacker.id, undefined, "special"),
        true
      );
    } else if (check.success) {
      eventBus.emit(
        GameEventNames.UI_Notification,
        `${target.playerName} is Placed Prone!`
      );
      target.status = PlayerStatus.PRONE;
      eventBus.emit(GameEventNames.PlayerStatusChanged, target);
      bounceIfBallUnder(context, target);
    } else {
      eventBus.emit(GameEventNames.UI_Notification, "The flame gutters out.");
    }
  }
}
