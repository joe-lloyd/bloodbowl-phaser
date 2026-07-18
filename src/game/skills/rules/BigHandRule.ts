/**
 * Big Hand (2025 p.124) — "This player ignores all negative modifiers when
 * attempting to pick up the ball." The engine's only negative pickup
 * modifier is marking (-1 per opponent), which this cancels.
 */

import { SkillType } from "../../../types/Skills";
import { SkillRule } from "../SkillRule";

export const BigHandRule: SkillRule = {
  onPickup(ctx, self) {
    if (self.id !== ctx.player.id || ctx.marking === 0) return;
    ctx.modifiers += ctx.marking;
    ctx.triggers.push({
      playerId: self.id,
      skill: SkillType.BIG_HAND,
      effect: `Big Hand: ignores ${ctx.marking} marking modifier(s)`,
    });
  },
};
