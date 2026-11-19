import { SkillType } from "../../../types/Skills";
import { type SkillRule } from "../SkillRule";

export const SafePassRule: SkillRule = {
  onPassResult(ctx, self) {
    if (self.id !== ctx.player.id) return;
    if (!ctx.fumbled || ctx.roll !== 1) return;
    ctx.keepBall = true;
    ctx.triggers.push({
      playerId: self.id,
      skill: SkillType.SAFE_PASS,
      effect: "Safe Pass: fumble cancelled, ball held, activation ends",
    });
  },
};
