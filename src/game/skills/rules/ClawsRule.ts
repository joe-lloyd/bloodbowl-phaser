import { SkillType } from "../../../types/Skills";
import { type SkillRule } from "../SkillRule";

export const ClawsRule: SkillRule = {
  onArmourBreak(ctx, self) {
    if (!ctx.causedBy || self.id !== ctx.causedBy.id) return;
    if (ctx.cause !== "block" && ctx.cause !== "lash-out") return;
    if (ctx.roll < 8) return;
    if (ctx.broken) return;

    ctx.forcedBreak = true;
    ctx.triggers.push({
      playerId: self.id,
      skill: SkillType.CLAWS,
      effect: `Claws: natural ${String(ctx.roll)} breaks armour regardless of AV`,
    });
  },
};
