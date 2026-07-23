import { GameOperation } from "../core/GameOperation";
import { GameEventNames } from "../../types/events";
import { IGameService } from "../../services/interfaces/IGameService";
import { PlayerStatus } from "../../types/Player";
import { SkillType } from "../../types/Skills";
import { FlowContext } from "../core/GameFlowManager";
import { InjuryOperation } from "./InjuryOperation";
import { ArmourOperation } from "./ArmourOperation";
import { BounceOperation } from "./BounceOperation";

/** Ends the wielder's activation once the Chainsaw Attack has settled. */
class FinishChainsawOperation extends GameOperation {
  public readonly name = "FinishChainsaw";

  constructor(private attackerId: string) {
    super();
  }

  async execute(context: FlowContext): Promise<void> {
    context.gameService.finishActivation(this.attackerId);
  }
}

/**
 * Chainsaw Attack (2025 rulebook p.122, Chainsaw trait)
 *
 * "Roll a D6. On a 2+, this player may immediately make an Armour Roll against
 * one adjacent Standing opposition player, applying a +3 modifier to the Armour
 * Roll. On a 1, the Chainsaw will Kick-back and this player is Knocked Down
 * instead." The activation ends as soon as the Chainsaw Attack is performed.
 *
 * The always-on "+3 to Armour Rolls made against a knocked-down Chainsaw
 * player" clause lives in ChainsawRule (onArmourBreak), so it applies to the
 * Kick-back knock-down here and to any other knockdown. NOT modelled yet: the
 * Foul-with-chainsaw (+3) and the Blitz block replacement clauses.
 */
export class ChainsawAttackOperation extends GameOperation {
  public readonly name = "ChainsawAttackOperation";

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

    // Kick-back die: a natural 1 kicks back and Knocks the wielder Down.
    const kick = dice.rollSkillCheck(
      "Chainsaw Kick-back",
      2,
      0,
      attacker.playerName
    );

    if (!kick.success) {
      // Kick-back: the wielder is Knocked Down (a Turnover). The +3 armour
      // modifier for a downed Chainsaw player is applied by ChainsawRule.
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

    // 2+: an Armour Roll against the target with a +3 modifier.
    const armour = dice.rollArmorCheck(
      target.stats.AV - 3,
      target.playerName,
      attacker.teamId
    );

    if (armour.broken) {
      eventBus.emit(GameEventNames.UI_Notification, "ARMOUR BROKEN!");
      target.status = PlayerStatus.PRONE;
      eventBus.emit(GameEventNames.PlayerKnockedDown, { playerId: target.id });
      eventBus.emit(GameEventNames.PlayerStatusChanged, target);
      this.dropBallIfCarried(target, gameService, context);
      context.flowManager.add(
        new InjuryOperation(target.id, {
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
    const ball = gameService.getState().ballPosition;
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
