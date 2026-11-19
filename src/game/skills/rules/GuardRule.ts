import { SkillType } from "../../../types/Skills";
import { type SkillRule } from "../SkillRule";

export const GuardRule: SkillRule = {
  onCountAssists(ctx, self) {
    if (ctx.action !== "block") return;
    if (self.id !== ctx.assister.id) return;
    if (!ctx.negated) return;

    ctx.negated = false;
    ctx.triggers.push({
      playerId: self.id,
      skill: SkillType.GUARD,
      effect: "Guard: assists despite being marked",
    });
  },
};
