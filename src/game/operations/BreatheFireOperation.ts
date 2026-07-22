import { GameOperation } from "../core/GameOperation";
import { GameEventNames } from "../../types/events";
import { IGameService } from "../../services/interfaces/IGameService";
import { PlayerStatus } from "../../types/Player";
import { SkillType } from "../../types/Skills";
import { FlowContext } from "../core/GameFlowManager";
import { ArmourOperation } from "./ArmourOperation";
import { BounceOperation } from "./BounceOperation";

/** Ends the breather's activation once everything has settled. */
class FinishBreatheFireOperation extends GameOperation {
  public readonly name = "FinishBreatheFire";

  constructor(private attackerId: string) {
    super();
  }

  async execute(context: FlowContext): Promise<void> {
    context.gameService.finishActivation(this.attackerId);
  }
}

/**
 * BreatheFireOperation (2025 rulebook p.126, Breathe Fire trait)
 *
 * Against a Standing opposition player this player is Marking: roll a D6,
 * -1 if the target's ST is 5 or higher. Natural 1: the breather is
 * immediately Knocked Down (a Knocked Down active-team player — a
 * turnover). 2-3: nothing. 4+: the target is Placed Prone (no armour
 * roll). Natural 6: the target is Knocked Down instead. May replace the
 * Block Action of a Blitz. The activation ends once resolved.
 */
export class BreatheFireOperation extends GameOperation {
  public readonly name = "BreatheFireOperation";

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
      eventBus.emit(
        GameEventNames.UI_Notification,
        "Target must be Marked by the breather!"
      );
      return;
    }

    eventBus.emit(GameEventNames.SkillTriggered, {
      playerId: attacker.id,
      skill: SkillType.BREATHE_FIRE,
      effect: `Breathe Fire: a gout of flame at ${target.playerName}`,
    });
    await context.delay(600);

    const strong = target.stats.ST >= 5;
    const check = dice.rollSkillCheck(
      "Breathe Fire",
      4,
      strong ? -1 : 0,
      attacker.playerName,
      attacker.teamId
    );
    const ball = gameService.getState().ballPosition;

    if (check.roll === 1) {
      // The flame washes back: the breather is Knocked Down — a turnover
      eventBus.emit(GameEventNames.UI_Notification, "The flame washes back!");
      attacker.status = PlayerStatus.PRONE;
      eventBus.emit(GameEventNames.PlayerKnockedDown, {
        playerId: attacker.id,
      });
      eventBus.emit(GameEventNames.PlayerStatusChanged, attacker);
      if (
        ball &&
        ball.x === attacker.gridPosition.x &&
        ball.y === attacker.gridPosition.y
      ) {
        context.flowManager.add(
          new BounceOperation({ ...attacker.gridPosition }),
          true
        );
      }
      context.flowManager.add(new ArmourOperation(attacker.id), true);
      gameService.triggerTurnover("Knocked Down by their own fire");
    } else if (check.roll === 6) {
      // Natural 6: the target is Knocked Down instead of Placed Prone
      eventBus.emit(GameEventNames.UI_Notification, "ENGULFED!");
      target.status = PlayerStatus.PRONE;
      eventBus.emit(GameEventNames.PlayerKnockedDown, { playerId: target.id });
      eventBus.emit(GameEventNames.PlayerStatusChanged, target);
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
        // Breathe Fire is a special action, not a Block — never arms Plague Ridden.
        new ArmourOperation(target.id, attacker.id, undefined, "special"),
        true
      );
    } else if (check.success) {
      // 4+ after the modifier: Placed Prone — no armour roll
      eventBus.emit(
        GameEventNames.UI_Notification,
        `${target.playerName} is Placed Prone!`
      );
      target.status = PlayerStatus.PRONE;
      eventBus.emit(GameEventNames.PlayerStatusChanged, target);
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
    } else {
      eventBus.emit(GameEventNames.UI_Notification, "The flame gutters out.");
    }

    context.flowManager.add(new FinishBreatheFireOperation(this.attackerId));
  }
}
