/**
 * Break Tackle (2025 p.126) — "Once per Turn, when this player attempts
 * to Dodge, they may apply a +1 modifier to the Agility Test if they have
 * a Strength Characteristic of 4, or a +3 modifier ... of 5 or higher."
 * No effect for ST 3 or less. Auto-applied on the turn's first dodge
 * (the modifier is never harmful).
 */

import { SkillType } from "../../../types/Skills";
import { SkillRule } from "../SkillRule";

export const BreakTackleRule: SkillRule = {
  onDodgeDeclared(ctx, self) {
    if (self.id !== ctx.player.id) return;
    const bonus = self.stats.ST >= 5 ? 3 : self.stats.ST === 4 ? 1 : 0;
    if (bonus === 0) return;
    if (!ctx.arbiter?.onceAvailable(self, SkillType.BREAK_TACKLE)) return;

    ctx.arbiter.consumeOnce(self, SkillType.BREAK_TACKLE);
    ctx.modifiers += bonus;
    ctx.triggers.push({
      playerId: self.id,
      skill: SkillType.BREAK_TACKLE,
      effect: `Break Tackle: +${bonus} to the dodge (ST ${self.stats.ST})`,
    });
  },
};
