import { groundBall } from "@/game/rules/ballInTheAir";
import { GameOperation } from "../core/GameOperation";
import { GameEventNames } from "../../types/events";
import { type Player, PlayerStatus } from "../../types/Player";
import { SkillType } from "../../types/Skills";
import { type FlowContext } from "../core/GameFlowManager";
import { ArmourOperation } from "./ArmourOperation";
import { BounceOperation } from "./BounceOperation";
import { adjacentStandingRefusal } from "./specialActionTarget";

class FinishBreatheFireOperation extends GameOperation {
  public readonly name = "FinishBreatheFire";

  private attackerId: string;
  constructor(attackerId: string) {
    super();
    this.attackerId = attackerId;
  }

  async execute(context: FlowContext): Promise<void> {
    context.gameService.finishActivation(this.attackerId);
  }
}

interface Square {
  x: number;
  y: number;
}

function bounceFrom(
  context: FlowContext,
  at: Square,
  ball: Square | null
): void {
  if (ball && ball.x === at.x && ball.y === at.y) {
    context.flowManager.add(new BounceOperation({ ...at }), true);
  }
}

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

export class BreatheFireOperation extends GameOperation {
  public readonly name = "BreatheFireOperation";

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
      { reason: "Breathe Fire",target: 4,modifier: strong? -1:0,playerName: attacker.playerName,teamId: attacker.teamId }    );
    const ball = groundBall(gameService.getState());

    if (check.roll === 1) {
      eventBus.emit(GameEventNames.UI_Notification, "The flame washes back!");
      knockDown(context, attacker, attacker.gridPosition, ball);
      context.flowManager.add(new ArmourOperation(attacker.id), true);
      gameService.triggerTurnover("Knocked Down by their own fire");
    } else if (check.roll === 6) {
      eventBus.emit(GameEventNames.UI_Notification, "ENGULFED!");
      knockDown(context, target, target.gridPosition, ball);
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
      bounceFrom(context, target.gridPosition, ball);
    } else {
      eventBus.emit(GameEventNames.UI_Notification, "The flame gutters out.");
    }

    context.flowManager.add(new FinishBreatheFireOperation(this.attackerId));
  }
}
