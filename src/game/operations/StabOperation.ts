import { SkillType } from "../../types/Skills";
import { type FlowContext } from "../core/GameFlowManager";
import { effectiveAV } from "../kickoff/driveEffects";
import { announceArmour, foldArmourRoll } from "./ArmourOperation";
import { gatherParticipants } from "../skills";
import { FinishActivationOperation } from "./FinishActivationOperation";
import { settleSpecialArmour } from "./knockDown";
import {
  AdjacentTargetOperation,
  type Duel,
  type Opening,
} from "./specialActionTarget";

class FinishStabOperation extends FinishActivationOperation {
  override async execute(context: FlowContext): Promise<void> {
    await context.gameService.finishStabActivation(this.playerId);
  }
}

export class StabOperation extends AdjacentTargetOperation {
  public readonly name = "StabOperation";
  protected readonly notAdjacent = "Target must be adjacent!";
  protected readonly finishName = "FinishStab";

  protected override finish(): FinishStabOperation {
    return new FinishStabOperation(this.finishName, this.attackerId);
  }

  protected opening({ attacker, target }: Duel): Opening {
    return {
      notice: `${attacker.playerName} stabs ${target.playerName}!`,
      skill: SkillType.STAB,
      effect: `Stab: an unmodifiable Armour Roll against ${target.playerName}`,
      pause: 800,
    };
  }

  protected async resolve(
    context: FlowContext,
    { attacker, target, dice }: Duel
  ): Promise<void> {
    const { gameService, eventBus } = context;

    const armour = dice.rollArmorCheck(
      { av: effectiveAV(target,gameService.getState()),playerName: target.playerName,teamId: attacker.teamId }    );

    const armourCtx = await foldArmourRoll(
      context,
      gatherParticipants(attacker, target, []),
      {
        player: target,
        causedBy: attacker,
        cause: "special",
        knockedDown: false,
        roll: armour.roll,
        armourModifier: 0,
      }
    );
    announceArmour(eventBus, {
      playerId: target.id,
      roll: armour.roll,
      armor: effectiveAV(target, gameService.getState()),
      broken: armourCtx.broken,
      rollType: "Armor Check",
      diceTeamId: attacker.teamId,
    });

    settleSpecialArmour(context, {
      victim: target,
      causedBy: attacker,
      broken: armourCtx.broken,
      injuryModifier: armourCtx.injuryModifier,
      announceBreak: true,
    });
  }
}
