import { GamePhase } from "@/types/GameState";
import { PlayerCondition, hasCondition } from "@/types/Player";
import { GameEventNames } from "../../types/events";
import { GameOperation } from "../core/GameOperation";
import { FlowContext } from "../core/GameFlowManager";
import { moveBallAndChain } from "../operations/BallAndChainOperation";
import type { BlockActivation } from "./BlockActivation";

/**
 * Offers the blocker the follow-up into the square their crowd-surfed
 * victim vacated. Queued at the BACK of the flow so the crowd injury and
 * throw-in chain fully settle (ball at rest) before the prompt; the
 * blocker's activation then ends with the follow-up reply, never before.
 */
export class CrowdSurfFollowUpOperation extends GameOperation {
  public readonly name = "CrowdSurfFollowUp";

  constructor(
    private attackerId: string,
    private targetSquare: { x: number; y: number }
  ) {
    super();
  }

  async execute(context: FlowContext): Promise<void> {
    context.eventBus.emit(GameEventNames.UI_FollowUpPrompt, {
      attackerId: this.attackerId,
      targetSquare: this.targetSquare,
    });
  }
}

/**
 * Ends the blocker's activation once the push chain (and any armour/injury
 * rolls it queued) has fully settled. Queued at the BACK of the flow so the
 * turn only flips after those rolls apply — used when no follow-up prompt
 * will fire to end the activation (Fend denied the follow-up). Pile Driver
 * and Hit and Run still get their turn first.
 */
export class FinishActivationOperation extends GameOperation {
  public readonly name = "FinishActivation";

  constructor(
    private manager: BlockActivation,
    private attackerId: string
  ) {
    super();
  }

  async execute(_context: FlowContext): Promise<void> {
    this.manager.endBlockActivation(this.attackerId);
  }
}

/**
 * Taunt (2025 rulebook p.136): the pushed player's coach made the blocker
 * Follow-up. Runs the free move without offering a choice; the activation
 * ends via a FinishActivationOperation queued at the back, once armour and
 * injury rolls have settled.
 */
export class ForcedFollowUpOperation extends GameOperation {
  public readonly name = "ForcedFollowUp";

  constructor(
    private attackerId: string,
    private targetSquare: { x: number; y: number }
  ) {
    super();
  }

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

/**
 * Runs operations one after another, each with everything it queues: a
 * Knocked Down player's Armour Roll and Injury, then the ball they dropped
 * Bounces (2025 rulebook p.44). Adding them to the front one by one runs
 * them in a different order from an idle flow, which starts the first at
 * once, than from inside one.
 */
export class InOrderOperation extends GameOperation {
  public readonly name = "InOrder";

  constructor(private operations: GameOperation[]) {
    super();
  }

  async execute(context: FlowContext): Promise<void> {
    // Added to an idle flow this starts at once: yield, so what the caller
    // queues next (a follow-up, the end of the activation) waits behind it
    await Promise.resolve();
    for (const operation of this.operations) {
      await context.flowManager.runToRest(operation);
    }
  }
}

/**
 * A touchdown ends the drive, and any block still queued with it. A Charge!
 * Blitz runs during KICKOFF, so that phase is not over.
 */
export const driveOver = (phase: GamePhase) =>
  phase === GamePhase.TOUCHDOWN ||
  phase === GamePhase.SETUP ||
  phase === GamePhase.HALFTIME ||
  phase === GamePhase.GAME_OVER;

/**
 * Frenzy (2025 rulebook p.130): the blocker must follow up a Push Back, and
 * if the target is still Standing must throw a second Block Action at the same
 * player. Runs after the first push settles; the second block re-enters the
 * normal block flow (which will not Frenzy again — one extra block only).
 */
export class FrenzyOperation extends GameOperation {
  public readonly name = "Frenzy";

  constructor(
    private manager: BlockActivation,
    private attackerId: string,
    private defenderId: string,
    /** Null when the target stood firm: nothing to follow up into. */
    private vacatedSquare: { x: number; y: number } | null,
    private targetStanding: boolean
  ) {
    super();
  }

  async execute(context: FlowContext): Promise<void> {
    // The push scored: the board is being cleared.
    if (driveOver(context.gameService.getPhase())) return;
    if (this.vacatedSquare) {
      // Let the Push Back animation land before the blocker follows up…
      await context.delay(300);
      // Frenzy forces the follow-up into the vacated square.
      await context.gameService.followUpPush(
        this.attackerId,
        this.vacatedSquare
      );
      // …and let that follow-up move finish before the second Block window opens.
      await context.delay(450);
    }
    // Queued, so it runs after a Bloodlust bite the follow-up may have raised.
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

export class FrenzySecondBlockOperation extends GameOperation {
  public readonly name = "FrenzySecondBlock";

  constructor(
    private manager: BlockActivation,
    private attackerId: string,
    private defenderId: string,
    private targetStanding: boolean
  ) {
    super();
  }

  async execute(context: FlowContext): Promise<void> {
    // A carrier following up into the end zone has just scored.
    if (driveOver(context.gameService.getPhase())) return;
    // Or found no Thrall to bite: Distracted, the ball dropped, the turn over.
    const attacker = context.gameService.getPlayerById(this.attackerId);
    if (attacker && hasCondition(attacker, PlayerCondition.DISTRACTED)) return;
    await this.manager.frenzySecondBlock(
      this.attackerId,
      this.defenderId,
      this.targetStanding
    );
  }
}

/**
 * Advances a Multiple Block only after the first block's complete push,
 * armour, injury, and ball chain has settled. A latched Turnover waits for
 * this operation too, so the second Block is still resolved in full.
 */
export class ContinueMultipleBlockOperation extends GameOperation {
  public readonly name = "ContinueMultipleBlock";

  constructor(
    private manager: BlockActivation,
    private attackerId: string
  ) {
    super();
  }

  async execute(_context: FlowContext): Promise<void> {
    await this.manager.continueMultipleBlock(this.attackerId);
  }
}

/**
 * Hit and Run (2025 rulebook p.130): after fully resolving a Block, a still-
 * Standing player may move one free square (ignoring Tackle Zones) that leaves
 * them neither Marked by nor Marking any opponent. Offered as a yes/no
 * reaction; the free square is one that satisfies the constraint.
 */
export class HitAndRunOperation extends GameOperation {
  public readonly name = "HitAndRun";

  constructor(
    private manager: BlockActivation,
    private attackerId: string
  ) {
    super();
  }

  async execute(_context: FlowContext): Promise<void> {
    await this.manager.resolveHitAndRun(this.attackerId);
  }
}
