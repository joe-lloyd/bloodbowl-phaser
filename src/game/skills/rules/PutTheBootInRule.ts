import { SkillType } from "../../../types/Skills";
import { type SkillRule } from "../SkillRule";

export const PutTheBootInRule: SkillRule = {
  onCountAssists(ctx, self) {
    if (ctx.action !== "foul") return;
    if (self.id !== ctx.assister.id) return;
    if (!ctx.negated) return;

    ctx.negated = false;
    ctx.triggers.push({
      playerId: self.id,
      skill: SkillType.PUT_THE_BOOT_IN,
      effect: "Put the Boot In: assists a Foul despite being marked",
    });
  },
};
