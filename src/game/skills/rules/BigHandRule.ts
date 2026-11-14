/**
 * Big Hand (2025 p.124) — "This player ignores all negative modifiers when
 * attempting to pick up the ball." That cancels marking (-1 per opponent)
 * and Pouring Rain's -1.
 */

import { SkillType } from "../../../types/Skills";
import { SkillRule } from "../SkillRule";

export const BigHandRule: SkillRule = {
  onPickup(ctx, self) {
    const ignored = ctx.marking + Math.max(0, -ctx.weather);
    if (self.id !== ctx.player.id || ignored === 0) return;
    ctx.modifiers += ignored;
    ctx.triggers.push({
      playerId: self.id,
      skill: SkillType.BIG_HAND,
      effect: `Big Hand: ignores ${ignored} negative pick-up modifier(s)`,
    });
  },
};
