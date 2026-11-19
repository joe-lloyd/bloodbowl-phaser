import { SkillType } from "../../../types/Skills";
import { type SkillRule } from "../SkillRule";

export const MonstrousMouthRule: SkillRule = {
  onPush(ctx, self) {
    if (self.id !== ctx.pushed.id || !ctx.stripBall) return;
    ctx.stripBall = false;
    ctx.triggers.push({
      playerId: self.id,
      skill: SkillType.MONSTROUS_MOUTH,
      effect: "Monstrous Mouth: Strip Ball cannot be used against this player",
    });
  },
};
