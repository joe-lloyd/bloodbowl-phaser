import { SkillType } from "../../../types/Skills";
import { type SkillRule } from "../SkillRule";

export const FendRule: SkillRule = {
  onPush(ctx, self) {
    if (self.id !== ctx.pushed.id) return;
    if (ctx.blockerIgnoresReactions) return;
    ctx.preventFollowUp = true;
    ctx.triggers.push({
      playerId: self.id,
      skill: SkillType.FEND,
      effect: "Fend: the blocker may not follow up",
    });
  },
};
