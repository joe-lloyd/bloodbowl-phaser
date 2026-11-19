import { GameOperation } from "../core/GameOperation";
import { type FlowContext } from "../core/GameFlowManager";
import { GameEventNames } from "../../types/events";
import { SkillType, hasSkill } from "../../types/Skills";
import { isLegalHandoffTarget } from "../rules/handoff";
import { foldTrigger, type HandoffDeclaredContext } from "../skills";
import { CatchOperation } from "./CatchOperation";
import { FinishPassActivationOperation } from "./PassOperation";

export class HandoffOperation extends GameOperation {
  public readonly name = "HandoffOperation";

  private passerId: string;
  private targetId: string;
  constructor(passerId: string, targetId: string) {
    super();
    this.passerId = passerId;
    this.targetId = targetId;
  }

  async execute(context: FlowContext): Promise<void> {
    const { gameService, eventBus, flowManager } = context;

    const passer = gameService.getPlayerById(this.passerId);
    const target = gameService.getPlayerById(this.targetId);
    if (!passer?.gridPosition || !target?.gridPosition) {
      return;
    }

    if (!isLegalHandoffTarget(passer, target)) {
      eventBus.emit(
        GameEventNames.UI_Notification,
        `${target.playerName} is not a legal Hand-off target.`
      );
      return;
    }

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
    ctx.triggers.forEach((t) => {
      eventBus.emit(GameEventNames.SkillTriggered, t);
    });

    if (ctx.refused) {
      eventBus.emit(
        GameEventNames.UI_Notification,
        `${passer.playerName} refuses to hand off to that team-mate!`
      );
      gameService.finishActivation(this.passerId);
      return;
    }

    gameService.setBallPosition(target.gridPosition.x, target.gridPosition.y);

    flowManager.add(
      new CatchOperation(
        target.id,
        { origin: "handoff" },
        { passerId: passer.id, passerTeamId: passer.teamId, accurate: true }
      ),
      true
    );

    const giveAndGoExempt = hasSkill(passer.skills, SkillType.GIVE_AND_GO);
    flowManager.add(
      new FinishPassActivationOperation(this.passerId, giveAndGoExempt)
    );
  }
}
