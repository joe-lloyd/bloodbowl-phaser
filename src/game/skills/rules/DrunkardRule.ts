/**
 * Drunkard (2025 rulebook p.127, trait) — "This player applies a -1
 * modifier to the test whenever they attempt to Rush."
 */

import { SkillType } from "../../../types/Skills";
import { SkillRule } from "../SkillRule";

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
