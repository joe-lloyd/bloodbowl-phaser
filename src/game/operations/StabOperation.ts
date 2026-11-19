import { groundBall } from "@/game/rules/ballInTheAir";
import { GameOperation } from "../core/GameOperation";
import { GameEventNames } from "../../types/events";
import { type IGameService } from "../../services/interfaces/IGameService";
import { PlayerStatus } from "../../types/Player";
import { SkillType } from "../../types/Skills";
import { type FlowContext } from "../core/GameFlowManager";
import { effectiveAV } from "../kickoff/driveEffects";
import { InjuryOperation } from "./InjuryOperation";
import { BounceOperation } from "./BounceOperation";
import { announceArmour, foldArmourRoll } from "./ArmourOperation";
import { gatherParticipants } from "../skills";

class FinishStabOperation extends GameOperation {
  public readonly name = "FinishStab";

  private attackerId: string;
  constructor(attackerId: string) {
    super();
    this.attackerId = attackerId;
  }

  async execute(context: FlowContext): Promise<void> {
    await context.gameService.finishStabActivation(this.attackerId);
  }
}

export class StabOperation extends GameOperation {
  public readonly name = "StabOperation";

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
    const diceController = gameService.getDiceController();

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
      `${attacker.playerName} stabs ${target.playerName}!`
    );
    eventBus.emit(GameEventNames.SkillTriggered, {
      playerId: attacker.id,
      skill: SkillType.STAB,
      effect: `Stab: an unmodifiable Armour Roll against ${target.playerName}`,
    });

    await context.delay(800);

    const armour = diceController.rollArmorCheck(
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

    if (armourCtx.broken) {
      eventBus.emit(GameEventNames.UI_Notification, "ARMOUR BROKEN!");
      target.status = PlayerStatus.PRONE;
      eventBus.emit(GameEventNames.PlayerKnockedDown, { playerId: target.id });
      eventBus.emit(GameEventNames.PlayerStatusChanged, target);

      const ball = groundBall(gameService.getState());
      if (
        ball &&
        ball.x === target.gridPosition.x &&
        ball.y === target.gridPosition.y
      ) {
        context.flowManager.add(
          new BounceOperation({ ...target.gridPosition }),
          true
        );
      }
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

    context.flowManager.add(new FinishStabOperation(this.attackerId));
  }
}
