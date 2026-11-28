import { restingBall } from "../rules/balls";
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
    for (const t of ctx.triggers) {
      eventBus.emit(GameEventNames.SkillTriggered, t);
    }

    if (ctx.refused) {
      eventBus.emit(
        GameEventNames.UI_Notification,
        `${passer.playerName} refuses to hand off to that team-mate!`
      );
      gameService.finishActivation(this.passerId);
      return;
    }

    const ball = restingBall(gameService.getState(), passer.gridPosition);
    gameService.placeBall(ball, target.gridPosition);

    flowManager.add(
      new CatchOperation(
        target.id,
        { origin: "handoff", ball },
        { passerId: passer.id, passerTeamId: passer.teamId, accurate: true }
      ),
      true
    );

    flowManager.add(
      new FinishPassActivationOperation(
        this.passerId,
        hasSkill(passer.skills, SkillType.GIVE_AND_GO),
        ball
      )
    );
  }
}
