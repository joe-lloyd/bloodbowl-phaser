import { GameOperation } from "../core/GameOperation";
import { FlowContext } from "../core/GameFlowManager";
import { GameEventNames } from "../../types/events";
import { SkillType, hasSkill } from "../../types/Skills";
import { isLegalHandoffTarget } from "../rules/handoff";
import { foldTrigger, HandoffDeclaredContext } from "../skills";
import { CatchOperation } from "./CatchOperation";
import { FinishPassActivationOperation } from "./PassOperation";

/**
 * HandoffOperation
 *
 * The Hand-off Action end to end, WITHOUT going through PassOperation: no
 * Passing Ability Test, no Accurate/Inaccurate result, no fumble, no
 * scatter, and no interception opportunity. The ball is placed directly in
 * the target team-mate's square and they make a single Catch attempt.
 *
 * Responsibility:
 * - Re-validate the target (a forged/stale command must not move the ball).
 * - Fold the one skill that genuinely keys off a Hand-off declaration
 *   (Animosity) — everything pass-only (Safe Pass, Cloud Burster, Hail Mary
 *   Pass, Dump-Off, On the Ball) lives in PassOperation and is simply never
 *   reached from here.
 * - Transfer the ball and queue the receiving Catch.
 * - End the activation (Give and Go keeps it open, per FinishPassActivationOperation).
 */
export class HandoffOperation extends GameOperation {
  public readonly name = "HandoffOperation";

  constructor(
    private passerId: string,
    private targetId: string
  ) {
    super();
  }

  async execute(context: FlowContext): Promise<void> {
    const { gameService, eventBus, flowManager } = context;

    const passer = gameService.getPlayerById(this.passerId);
    const target = gameService.getPlayerById(this.targetId);
    if (!passer || !passer.gridPosition || !target || !target.gridPosition) {
      return;
    }

    // Resolution-time re-validation, measured from the hander-off's actual
    // final square — guards a forged/stale command (a networked guest, a
    // replayed headless script) rather than trusting the declaration.
    if (!isLegalHandoffTarget(passer, target)) {
      eventBus.emit(
        GameEventNames.UI_Notification,
        `${target.playerName} is not a legal Hand-off target.`
      );
      return;
    }

    // Trigger point: hand-off declared — Animosity may refuse it outright.
    const ctx: HandoffDeclaredContext = {
      player: passer,
      targetPlayer: target,
      decisions: gameService.getDecisionService(),
      flow: flowManager,
      arbiter: gameService.getRerollArbiter(),
      dice: gameService.getDiceController(),
      triggers: [],
    };
    await foldTrigger("onHandoffDeclared", [passer], ctx);
    ctx.triggers.forEach((t) => eventBus.emit(GameEventNames.SkillTriggered, t));

    if (ctx.refused) {
      eventBus.emit(
        GameEventNames.UI_Notification,
        `${passer.playerName} refuses to hand off to that team-mate!`
      );
      gameService.finishActivation(this.passerId);
      return;
    }

    // No roll, no scatter: the ball is simply placed in the target's hands.
    gameService.setBallPosition(target.gridPosition.x, target.gridPosition.y);

    // The receiving Catch — a dropped hand-off bounces and is a turnover
    // under the normal rules, same as a dropped pass. `accurate: true`
    // marks a caught hand-off as a completion (match-stats' completions
    // counter), same as a completed pass.
    flowManager.add(
      new CatchOperation(
        target.id,
        true,
        { origin: "handoff" },
        { passerId: passer.id, passerTeamId: passer.teamId, accurate: true }
      ),
      true
    );

    // A Hand-off Action ends the activation once it settles. Give and Go
    // keeps it open (so long as no Turnover was caused) — unconditionally
    // for a Hand-off, unlike Give and Go's Quick-Pass-only exemption on a
    // thrown Pass.
    const giveAndGoExempt = hasSkill(passer.skills, SkillType.GIVE_AND_GO);
    flowManager.add(
      new FinishPassActivationOperation(this.passerId, giveAndGoExempt)
    );
  }
}
