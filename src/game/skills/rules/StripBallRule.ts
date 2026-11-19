import { SkillType } from "../../../types/Skills";
import { type SkillRule } from "../SkillRule";

export const StripBallRule: SkillRule = {
  onPush(ctx, self) {
    if (self.id !== ctx.attacker.id || !ctx.pushedHasBall) return;
    ctx.stripBall = true;
    ctx.triggers.push({
      playerId: self.id,
      skill: SkillType.STRIP_BALL,
      effect: "Strip Ball: the carrier drops the ball where pushed",
    });
  },
};
