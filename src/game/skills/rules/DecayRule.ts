/**
 * Decay (2025 p.127, compulsory trait) — "Apply a +1 modifier to any
 * Casualty Roll made against this player."
 */

import { SkillType } from "../../../types/Skills";
import { SkillRule } from "../SkillRule";

export const DecayRule: SkillRule = {
  onCasualtyRoll(ctx, self) {
    if (self.id !== ctx.player.id) return;
    ctx.modifier += 1;
    ctx.triggers.push({
      playerId: self.id,
      skill: SkillType.DECAY,
      effect: "Decay: +1 to the casualty roll",
    });
  },
};
