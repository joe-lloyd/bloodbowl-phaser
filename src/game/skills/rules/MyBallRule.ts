import { SkillType } from "../../../types/Skills";
import { type SkillRule } from "../SkillRule";

export const MyBallRule: SkillRule = {
  onActionDeclared(ctx, self) {
    const givesUpBall =
      ctx.action === "pass" ||
      ctx.action === "handoff" ||
      (ctx.action === "throwTeamMate" && ctx.hasBall);
    if (!givesUpBall) return;
    ctx.refused = true;
    ctx.triggers.push({
      playerId: self.id,
      skill: SkillType.MY_BALL,
      effect: "My Ball: will not willingly give up the ball",
    });
  },
};
