import { SkillType } from "../../../types/Skills";
import { type SkillRule } from "../SkillRule";

export const StuntyRule: SkillRule = {
  onDodgeDeclared(ctx, self) {
    if (self.id !== ctx.player.id) return;
    if (ctx.markingPenalty >= 0) return;

    ctx.modifiers -= ctx.markingPenalty;
    ctx.markingPenalty = 0;
    ctx.triggers.push({
      playerId: self.id,
      skill: SkillType.STUNTY,
      effect: "Stunty: ignores marking modifiers on the dodge",
    });
  },

  onInjuryRoll(ctx, self) {
    if (self.id !== ctx.player.id) return;

    ctx.table = "stunty";
    ctx.triggers.push({
      playerId: self.id,
      skill: SkillType.STUNTY,
      effect: "Stunty: rolls on the Stunty Injury Table",
    });
  },
};
