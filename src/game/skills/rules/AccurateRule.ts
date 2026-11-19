import { SkillType } from "../../../types/Skills";
import { type SkillRule } from "../SkillRule";

export const AccurateRule: SkillRule = {
  onPassDeclared(ctx, self) {
    if (self.id !== ctx.player.id) return;
    if (ctx.passType !== "Quick Pass" && ctx.passType !== "Short Pass") return;
    ctx.modifiers += 1;
    ctx.triggers.push({
      playerId: self.id,
      skill: SkillType.ACCURATE,
      effect: `Accurate: +1 to the ${ctx.passType}`,
    });
  },
};
