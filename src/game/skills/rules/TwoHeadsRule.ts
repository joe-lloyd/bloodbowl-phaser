/**
 * Two Heads (2025 p.138) — "This player may apply a +1 modifier to the
 * Agility Test whenever they attempt to Dodge."
 */

import { SkillType } from "../../../types/Skills";
import { SkillRule } from "../SkillRule";

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
