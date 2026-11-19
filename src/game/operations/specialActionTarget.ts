import { type Player, PlayerStatus } from "../../types/Player";
import { GameEventNames } from "../../types/events";
import { GameOperation } from "../core/GameOperation";
import { type FlowContext } from "../core/GameFlowManager";
import { type SkillType } from "../../types/Skills";
import { type DiceController } from "../controllers/DiceController";
import { FinishActivationOperation } from "./FinishActivationOperation";

interface Square {
  x: number;
  y: number;
}

export interface Duel {
  attacker: Player;
  target: Player;
  dice: DiceController;
}

function adjacentStandingRefusal(
  { from, to }: { from: Square; to: Square },
  target: Player,
  notAdjacent: string
): string | null {
  if (target.status !== PlayerStatus.ACTIVE) return "Target must be Standing!";
  const dx = Math.abs(from.x - to.x);
  const dy = Math.abs(from.y - to.y);
  if (dx > 1 || dy > 1 || dx + dy === 0) return notAdjacent;
  return null;
}

export interface Opening {
  skill: SkillType;
  effect: string;
  notice?: string;
  pause?: number;
}

export abstract class AdjacentTargetOperation extends GameOperation {
  protected abstract readonly notAdjacent: string;
  protected abstract readonly finishName: string;

  protected readonly attackerId: string;
  private readonly targetId: string;
  constructor(attackerId: string, targetId: string) {
    super();
    this.attackerId = attackerId;
    this.targetId = targetId;
  }

  async execute(context: FlowContext): Promise<void> {
    const duel = this.duel(context);
    if (!duel) return;
    const opening = this.opening(duel);
    if (opening.notice !== undefined) {
      context.eventBus.emit(GameEventNames.UI_Notification, opening.notice);
    }
    context.eventBus.emit(GameEventNames.SkillTriggered, {
      playerId: duel.attacker.id,
      skill: opening.skill,
      effect: opening.effect,
    });
    await context.delay(opening.pause ?? 600);

    await this.resolve(context, duel);
    context.flowManager.add(this.finish());
  }

  private duel(context: FlowContext): Duel | null {
    const attacker = context.gameService.getPlayerById(this.attackerId);
    const target = context.gameService.getPlayerById(this.targetId);
    if (!attacker?.gridPosition || !target?.gridPosition) return null;

    const refusal = adjacentStandingRefusal(
      { from: attacker.gridPosition, to: target.gridPosition },
      target,
      this.notAdjacent
    );
    if (refusal) {
      context.eventBus.emit(GameEventNames.UI_Notification, refusal);
      return null;
    }
    return { attacker, target, dice: context.gameService.getDiceController() };
  }

  protected finish(): GameOperation {
    return new FinishActivationOperation(this.finishName, this.attackerId);
  }

  protected abstract opening(duel: Duel): Opening;

  protected abstract resolve(
    context: FlowContext,
    duel: Duel
  ): Promise<void> | void;
}
