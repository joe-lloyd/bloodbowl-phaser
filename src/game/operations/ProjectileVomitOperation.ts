import { GameEventNames } from "../../types/events";
import { SkillType } from "../../types/Skills";
import { type FlowContext } from "../core/GameFlowManager";
import { effectiveAV } from "../kickoff/driveEffects";
import {
  AdjacentTargetOperation,
  type Duel,
  type Opening,
} from "./specialActionTarget";
import { announceArmour, foldArmourRoll } from "./ArmourOperation";
import { gatherParticipants } from "../skills";
import { settleSpecialArmour } from "./knockDown";

export class ProjectileVomitOperation extends AdjacentTargetOperation {
  public readonly name = "ProjectileVomitOperation";
  protected readonly notAdjacent = "Target must be adjacent!";
  protected readonly finishName = "FinishProjectileVomit";

  protected opening({ target }: Duel): Opening {
    return {
      skill: SkillType.PROJECTILE_VOMIT,
      effect: `Projectile Vomit: aimed at ${target.playerName}`,
    };
  }

  protected async resolve(
    context: FlowContext,
    { attacker, target, dice }: Duel
  ): Promise<void> {
    const { gameService, eventBus } = context;

    const aim = dice.rollSkillCheck(
      { reason: "Projectile Vomit",target: 2,modifier: 0,playerName: attacker.playerName,teamId: attacker.teamId }    );
    const victim = aim.success ? target : attacker;
    const selfHit = victim.id === attacker.id;
    eventBus.emit(
      GameEventNames.UI_Notification,
      selfHit
        ? `${attacker.playerName} is covered in acidic bile!`
        : `${target.playerName} is drenched!`
    );

    const armour = dice.rollArmorCheck(
      { av: effectiveAV(victim,gameService.getState()),playerName: victim.playerName,teamId: attacker.teamId }    );

    const causedBy = selfHit ? undefined : attacker;
    const armourCtx = await foldArmourRoll(
      context,
      gatherParticipants(causedBy ?? victim, causedBy ? victim : undefined, []),
      {
        player: victim,
        ...(causedBy === undefined ? {} : { causedBy: causedBy }),
        cause: "special",
        knockedDown: false,
        roll: armour.roll,
        armourModifier: 0,
      }
    );
    announceArmour(eventBus, {
      playerId: victim.id,
      roll: armour.roll,
      armor: effectiveAV(victim, gameService.getState()),
      broken: armourCtx.broken,
      rollType: "Armor Check",
      diceTeamId: attacker.teamId,
    });
    const knockedDown = settleSpecialArmour(context, {
      victim,
      causedBy,
      broken: armourCtx.broken,
      injuryModifier: armourCtx.injuryModifier,
      announceBreak: false,
    });
    if (knockedDown && selfHit) {
      gameService.triggerTurnover("Knocked Down by their own bile");
    }
  }
}
