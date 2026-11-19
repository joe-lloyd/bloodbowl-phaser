import { SkillType } from "../../../types/Skills";
import { type SkillRule } from "../SkillRule";

export const DrunkardRule: SkillRule = {
  onRushDeclared(ctx, self) {
    if (self.id !== ctx.player.id) return;
    ctx.modifiers -= 1;
    ctx.triggers.push({
      playerId: self.id,
      skill: SkillType.DRUNKARD,
      effect: "Drunkard: -1 to the Rush",
    });
  },
};
