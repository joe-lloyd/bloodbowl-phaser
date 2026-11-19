import { SkillType } from "../../../types/Skills";
import { type SkillRule } from "../SkillRule";

export const CannoneerRule: SkillRule = {
  onPassDeclared(ctx, self) {
    if (self.id !== ctx.player.id) return;
    if (ctx.passType !== "Long Pass" && ctx.passType !== "Long Bomb") return;
    ctx.modifiers += 1;
    ctx.triggers.push({
      playerId: self.id,
      skill: SkillType.CANNONEER,
      effect: `Cannoneer: +1 to the ${ctx.passType}`,
    });
  },
};
