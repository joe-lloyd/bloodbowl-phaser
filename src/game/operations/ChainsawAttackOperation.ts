import { GameEventNames } from "../../types/events";
import { SkillType } from "../../types/Skills";
import { type FlowContext } from "../core/GameFlowManager";
import { effectiveAV } from "../kickoff/driveEffects";
import {
  ArmourOperation,
  armourBroken,
  announceArmour,
  foldArmourRoll,
} from "./ArmourOperation";
import { gatherParticipants } from "../skills";
import {
  bounceIfBallUnder,
  knockDownPlayer,
  settleSpecialArmour,
} from "./knockDown";
import {
  AdjacentTargetOperation,
  type Duel,
  type Opening,
} from "./specialActionTarget";

export class ChainsawAttackOperation extends AdjacentTargetOperation {
  public readonly name = "ChainsawAttackOperation";
  protected readonly notAdjacent = "Target must be adjacent!";
  protected readonly finishName = "FinishChainsaw";

  protected opening({ attacker, target }: Duel): Opening {
    return {
      notice: `${attacker.playerName} revs the chainsaw at ${target.playerName}!`,
      skill: SkillType.CHAINSAW,
      effect: `Chainsaw Attack against ${target.playerName}`,
    };
  }

  protected async resolve(
    context: FlowContext,
    { attacker, target, dice }: Duel
  ): Promise<void> {
    const { gameService, eventBus } = context;

    const kick = dice.rollSkillCheck(
      { reason: "Chainsaw Kick-back",target: 2,modifier: 0,playerName: attacker.playerName }    );

    if (!kick.success) {
      eventBus.emit(GameEventNames.UI_Notification, "KICK-BACK!");
      knockDownPlayer(eventBus, attacker);
      bounceIfBallUnder(context, attacker);
      context.flowManager.add(new ArmourOperation(attacker.id), true);
      gameService.triggerTurnover("Chainsaw Kick-back");
      return;
    }

    const armour = dice.rollArmorCheck(
      { av: effectiveAV(target,gameService.getState()),playerName: target.playerName,teamId: attacker.teamId,modifier: 3 }    );
    const armourCtx = await foldArmourRoll(
      context,
      gatherParticipants(attacker, target, []),
      {
        player: target,
        causedBy: attacker,
        cause: "special",
        knockedDown: false,
        roll: armour.roll,
        armourModifier: 3,
      }
    );

    const broken = armourBroken(armourCtx, armour.roll, gameService);
    announceArmour(eventBus, {
      playerId: target.id,
      roll: armour.roll + armourCtx.armourModifier,
      armor: effectiveAV(target, gameService.getState()),
      broken,
      rollType: "Armor Check",
      diceTeamId: attacker.teamId,
    });
    settleSpecialArmour(context, {
      victim: target,
      causedBy: attacker,
      broken,
      injuryModifier: armourCtx.injuryModifier,
      announceBreak: true,
    });
  }
}
