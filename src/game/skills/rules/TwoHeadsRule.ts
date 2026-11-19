import { SkillType } from "../../../types/Skills";
import { type SkillRule } from "../SkillRule";

export const TwoHeadsRule: SkillRule = {
  onDodgeDeclared(ctx, self) {
    if (self.id !== ctx.player.id) return;
    ctx.modifiers += 1;
    ctx.triggers.push({
      playerId: self.id,
      skill: SkillType.TWO_HEADS,
      effect: "Two Heads: +1 to the dodge",
    });
  },
};
