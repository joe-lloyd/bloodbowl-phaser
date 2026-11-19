import { groundBall } from "@/game/rules/ballInTheAir";
import { GameOperation } from "../core/GameOperation";
import { GameEventNames } from "../../types/events";
import { type IGameService } from "../../services/interfaces/IGameService";
import { type Player, PlayerStatus } from "../../types/Player";
import { SkillType } from "../../types/Skills";
import { type FlowContext } from "../core/GameFlowManager";
import { effectiveAV } from "../kickoff/driveEffects";
import { InjuryOperation } from "./InjuryOperation";
import { BounceOperation } from "./BounceOperation";
import { adjacentStandingRefusal } from "./specialActionTarget";
import { announceArmour, foldArmourRoll } from "./ArmourOperation";
import { gatherParticipants } from "../skills";

class FinishVomitOperation extends GameOperation {
  public readonly name = "FinishProjectileVomit";

  private attackerId: string;
  constructor(attackerId: string) {
    super();
    this.attackerId = attackerId;
  }

  async execute(context: FlowContext): Promise<void> {
    context.gameService.finishActivation(this.attackerId);
  }
}

export class ProjectileVomitOperation extends GameOperation {
  public readonly name = "ProjectileVomitOperation";

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

    const refusal = adjacentStandingRefusal(
      attacker.gridPosition,
      target.gridPosition,
      target,
      "Target must be adjacent!"
    );
    if (refusal) {
      eventBus.emit(GameEventNames.UI_Notification, refusal);
      return;
    }

    eventBus.emit(GameEventNames.SkillTriggered, {
      playerId: attacker.id,
      skill: SkillType.PROJECTILE_VOMIT,
      effect: `Projectile Vomit: aimed at ${target.playerName}`,
    });
    await context.delay(600);

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
    if (armourCtx.broken) {
      this.knockDown(context, victim, causedBy, armourCtx.injuryModifier);
      if (selfHit) {
        gameService.triggerTurnover("Knocked Down by their own bile");
      }
    } else {
      eventBus.emit(GameEventNames.UI_Notification, "Armour Holds.");
    }

    context.flowManager.add(new FinishVomitOperation(this.attackerId));
  }

  private knockDown(
    context: FlowContext,
    victim: Player,
    causedBy: Player | undefined,
    injuryModifier: number
  ): void {
    const gameService = context.gameService;
    const eventBus = context.eventBus;
    victim.status = PlayerStatus.PRONE;
    eventBus.emit(GameEventNames.PlayerKnockedDown, { playerId: victim.id });
    eventBus.emit(GameEventNames.PlayerStatusChanged, victim);
    const ball = groundBall(gameService.getState());
    if (
      ball &&
      victim.gridPosition &&
      ball.x === victim.gridPosition.x &&
      ball.y === victim.gridPosition.y
    ) {
      context.flowManager.add(
        new BounceOperation({ ...victim.gridPosition }),
        true
      );
    }
    context.flowManager.add(
      new InjuryOperation(victim.id, {
        modifier: injuryModifier,
        ...(causedBy ? { causedById: causedBy.id, cause: "special" } : {}),
      }),
      true
    );
  }
}
