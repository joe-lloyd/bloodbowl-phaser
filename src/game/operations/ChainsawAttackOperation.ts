import { groundBall } from "@/game/rules/ballInTheAir";
import { GameOperation } from "../core/GameOperation";
import { GameEventNames } from "../../types/events";
import { type IGameService } from "../../services/interfaces/IGameService";
import { PlayerStatus } from "../../types/Player";
import { SkillType } from "../../types/Skills";
import { type FlowContext } from "../core/GameFlowManager";
import { effectiveAV } from "../kickoff/driveEffects";
import { InjuryOperation } from "./InjuryOperation";
import {
  ArmourOperation,
  armourBroken,
  announceArmour,
  foldArmourRoll,
} from "./ArmourOperation";
import { gatherParticipants } from "../skills";
import { BounceOperation } from "./BounceOperation";

class FinishChainsawOperation extends GameOperation {
  public readonly name = "FinishChainsaw";

  private attackerId: string;
  constructor(attackerId: string) {
    super();
    this.attackerId = attackerId;
  }

  async execute(context: FlowContext): Promise<void> {
    context.gameService.finishActivation(this.attackerId);
  }
}

export class ChainsawAttackOperation extends GameOperation {
  public readonly name = "ChainsawAttackOperation";

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
      eventBus.emit(GameEventNames.UI_Notification, "Target must be adjacent!");
      return;
    }

    eventBus.emit(
      GameEventNames.UI_Notification,
      `${attacker.playerName} revs the chainsaw at ${target.playerName}!`
    );
    eventBus.emit(GameEventNames.SkillTriggered, {
      playerId: attacker.id,
      skill: SkillType.CHAINSAW,
      effect: `Chainsaw Attack against ${target.playerName}`,
    });

    await context.delay(600);

    const kick = dice.rollSkillCheck(
      { reason: "Chainsaw Kick-back",target: 2,modifier: 0,playerName: attacker.playerName }    );

    if (!kick.success) {
      eventBus.emit(GameEventNames.UI_Notification, "KICK-BACK!");
      attacker.status = PlayerStatus.PRONE;
      eventBus.emit(GameEventNames.PlayerKnockedDown, {
        playerId: attacker.id,
      });
      eventBus.emit(GameEventNames.PlayerStatusChanged, attacker);
      this.dropBallIfCarried(attacker, gameService, context);
      context.flowManager.add(new ArmourOperation(attacker.id), true);
      gameService.triggerTurnover("Chainsaw Kick-back");
      context.flowManager.add(new FinishChainsawOperation(this.attackerId));
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
    if (broken) {
      eventBus.emit(GameEventNames.UI_Notification, "ARMOUR BROKEN!");
      target.status = PlayerStatus.PRONE;
      eventBus.emit(GameEventNames.PlayerKnockedDown, { playerId: target.id });
      eventBus.emit(GameEventNames.PlayerStatusChanged, target);
      this.dropBallIfCarried(target, gameService, context);
      context.flowManager.add(
        new InjuryOperation(target.id, {
          modifier: armourCtx.injuryModifier,
          causedById: attacker.id,
          cause: "special",
        }),
        true
      );
    } else {
      eventBus.emit(GameEventNames.UI_Notification, "Armour Holds.");
    }

    context.flowManager.add(new FinishChainsawOperation(this.attackerId));
  }

  private dropBallIfCarried(
    player: import("@/types/Player").Player,
    gameService: IGameService,
    context: FlowContext
  ): void {
    const ball = groundBall(gameService.getState());
    if (
      ball &&
      player.gridPosition &&
      ball.x === player.gridPosition.x &&
      ball.y === player.gridPosition.y
    ) {
      context.flowManager.add(
        new BounceOperation({ ...player.gridPosition }),
        true
      );
    }
  }
}
