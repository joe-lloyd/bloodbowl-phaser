import { GamePhase } from "@/types/GameState";
import { PlayerCondition, hasCondition } from "@/types/Player";
import { GameEventNames } from "../../types/events";
import { GameOperation } from "../core/GameOperation";
import { type FlowContext } from "../core/GameFlowManager";
import { moveBallAndChain } from "../operations/BallAndChainOperation";
import type { BlockActivation } from "./BlockActivation";

abstract class FollowUpStepOperation extends GameOperation {
  protected readonly attackerId: string;
  protected readonly targetSquare: { x: number; y: number };
  constructor(attackerId: string, targetSquare: { x: number; y: number }) {
    super();
    this.attackerId = attackerId;
    this.targetSquare = targetSquare;
  }
}

export class CrowdSurfFollowUpOperation extends FollowUpStepOperation {
  public readonly name = "CrowdSurfFollowUp";

  async execute(context: FlowContext): Promise<void> {
    context.eventBus.emit(GameEventNames.UI_FollowUpPrompt, {
      attackerId: this.attackerId,
      targetSquare: this.targetSquare,
    });
  }
}

export class FinishBlockOperation extends GameOperation {
  public readonly name = "FinishBlock";

  private attackerId: string;
  constructor(attackerId: string) {
    super();
    this.attackerId = attackerId;
  }

  async execute(context: FlowContext): Promise<void> {
    context.gameService.finishBlockActivation(this.attackerId);
  }
}

export class ForcedFollowUpOperation extends FollowUpStepOperation {
  public readonly name = "ForcedFollowUp";

  async execute(context: FlowContext): Promise<void> {
    const active = context.gameService.getState().activePlayer;
    const attacker = context.gameService.getPlayerById(this.attackerId);
    if (
      attacker &&
      active?.id === attacker.id &&
      active.action === "ballAndChain"
    ) {
      await moveBallAndChain(context, attacker, this.targetSquare);
      return;
    }
    await context.gameService.followUpPush(this.attackerId, this.targetSquare);
  }
}

export class InOrderOperation extends GameOperation {
  public readonly name = "InOrder";

  private operations: GameOperation[];
  constructor(operations: GameOperation[]) {
    super();
    this.operations = operations;
  }

  async execute(context: FlowContext): Promise<void> {
    await Promise.resolve();
    for (const operation of this.operations) {
      await context.flowManager.runToRest(operation);
    }
  }
}

export const driveOver = (phase: GamePhase) =>
  phase === GamePhase.TOUCHDOWN ||
  phase === GamePhase.SETUP ||
  phase === GamePhase.HALFTIME ||
  phase === GamePhase.GAME_OVER;

export class FrenzyOperation extends GameOperation {
  public readonly name = "Frenzy";

  private manager: BlockActivation;
  private attackerId: string;
  private defenderId: string;
  private vacatedSquare: { x: number; y: number } | null;
  private targetStanding: boolean;
  constructor(
    manager: BlockActivation,
    attackerId: string,
    defenderId: string,

    vacatedSquare: { x: number; y: number } | null,
    targetStanding: boolean
  ) {
    super();
    this.manager = manager;
    this.attackerId = attackerId;
    this.defenderId = defenderId;
    this.vacatedSquare = vacatedSquare;
    this.targetStanding = targetStanding;
  }

  async execute(context: FlowContext): Promise<void> {
    if (driveOver(context.gameService.getPhase())) return;
    if (this.vacatedSquare) {
      await context.delay(300);

      await context.gameService.followUpPush(
        this.attackerId,
        this.vacatedSquare
      );

      await context.delay(450);
    }

    context.flowManager.add(
      new FrenzySecondBlockOperation(
        this.manager,
        this.attackerId,
        this.defenderId,
        this.targetStanding
      )
    );
  }
}

class FrenzySecondBlockOperation extends GameOperation {
  public readonly name = "FrenzySecondBlock";

  private manager: BlockActivation;
  private attackerId: string;
  private defenderId: string;
  private targetStanding: boolean;
  constructor(
    manager: BlockActivation,
    attackerId: string,
    defenderId: string,
    targetStanding: boolean
  ) {
    super();
    this.manager = manager;
    this.attackerId = attackerId;
    this.defenderId = defenderId;
    this.targetStanding = targetStanding;
  }

  async execute(context: FlowContext): Promise<void> {
    if (driveOver(context.gameService.getPhase())) return;

    if (context.gameService.isTurnoverInProgress()) return;

    const attacker = context.gameService.getPlayerById(this.attackerId);
    if (attacker && hasCondition(attacker, PlayerCondition.DISTRACTED)) return;
    await this.manager.frenzySecondBlock(
      this.attackerId,
      this.defenderId,
      this.targetStanding
    );
  }
}

abstract class AttackerStepOperation extends GameOperation {
  protected readonly manager: BlockActivation;
  protected readonly attackerId: string;
  constructor(manager: BlockActivation, attackerId: string) {
    super();
    this.manager = manager;
    this.attackerId = attackerId;
  }
}

export class ContinueMultipleBlockOperation extends AttackerStepOperation {
  public readonly name = "ContinueMultipleBlock";

  async execute(_context: FlowContext): Promise<void> {
    await this.manager.continueMultipleBlock(this.attackerId);
  }
}

export class HitAndRunOperation extends AttackerStepOperation {
  public readonly name = "HitAndRun";

  async execute(_context: FlowContext): Promise<void> {
    await this.manager.resolveHitAndRun(this.attackerId);
  }
}
