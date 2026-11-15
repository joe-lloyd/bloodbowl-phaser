import { groundBall } from "@/game/rules/ballInTheAir";
import { GameOperation } from "../core/GameOperation";
import { GameEventNames } from "../../types/events";
import { IGameService } from "../../services/interfaces/IGameService";
import { Player, PlayerStatus } from "../../types/Player";
import { SkillType } from "../../types/Skills";
import { FlowContext } from "../core/GameFlowManager";
import { ArmourOperation } from "./ArmourOperation";
import { BounceOperation } from "./BounceOperation";
import { adjacentStandingRefusal } from "./specialActionTarget";

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

type Square = { x: number; y: number };

/** A ball held on `at` bounces from it, next in the queue. */
function bounceFrom(
  context: FlowContext,
  at: Square,
  ball: Square | null
): void {
  if (ball && ball.x === at.x && ball.y === at.y) {
    context.flowManager.add(new BounceOperation({ ...at }), true);
  }
}

/** Knock `player` Down, bouncing any ball they hold. */
function knockDown(
  context: FlowContext,
  player: Player,
  at: Square,
  ball: Square | null
): void {
  const { eventBus } = context;
  player.status = PlayerStatus.PRONE;
  eventBus.emit(GameEventNames.PlayerKnockedDown, { playerId: player.id });
  eventBus.emit(GameEventNames.PlayerStatusChanged, player);
  bounceFrom(context, at, ball);
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

    const refusal = adjacentStandingRefusal(
      attacker.gridPosition,
      target.gridPosition,
      target,
      "Target must be Marked by the breather!"
    );
    if (refusal) {
      eventBus.emit(GameEventNames.UI_Notification, refusal);
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
    const ball = groundBall(gameService.getState());

    if (check.roll === 1) {
      // The flame washes back: the breather is Knocked Down — a turnover
      eventBus.emit(GameEventNames.UI_Notification, "The flame washes back!");
      knockDown(context, attacker, attacker.gridPosition, ball);
      context.flowManager.add(new ArmourOperation(attacker.id), true);
      gameService.triggerTurnover("Knocked Down by their own fire");
    } else if (check.roll === 6) {
      // Natural 6: the target is Knocked Down instead of Placed Prone
      eventBus.emit(GameEventNames.UI_Notification, "ENGULFED!");
      knockDown(context, target, target.gridPosition, ball);
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
      bounceFrom(context, target.gridPosition, ball);
    } else {
      eventBus.emit(GameEventNames.UI_Notification, "The flame gutters out.");
    }

    context.flowManager.add(new FinishBreatheFireOperation(this.attackerId));
  }
}
