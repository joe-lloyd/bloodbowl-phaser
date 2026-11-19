import { SkillType } from "../../../types/Skills";
import { type SkillRule } from "../SkillRule";

export const BigHandRule: SkillRule = {
  onPickup(ctx, self) {
    const ignored = ctx.marking + Math.max(0, -ctx.weather);
    if (self.id !== ctx.player.id || ignored === 0) return;
    ctx.modifiers += ignored;
    ctx.triggers.push({
      playerId: self.id,
      skill: SkillType.BIG_HAND,
      effect: `Big Hand: ignores ${String(ignored)} negative pick-up modifier(s)`,
    });
  },
};
