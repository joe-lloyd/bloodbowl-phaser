/**
 * Accurate (2025 p.123) — "When this player performs a Pass Action which
 * is a Quick Pass or a Short Pass, this player may apply a +1 modifier to
 * the Passing Ability Test."
 */

import { SkillType } from "../../../types/Skills";
import { SkillRule } from "../SkillRule";

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
