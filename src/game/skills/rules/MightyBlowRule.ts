import { SkillType, findSkill } from "../../../types/Skills";
import { type SkillRule } from "../SkillRule";

export const MightyBlowRule: SkillRule = {
  onArmourBreak(ctx, self) {
    if (!ctx.causedBy || self.id !== ctx.causedBy.id) return;
    if (ctx.cause !== "block" && ctx.cause !== "lash-out") return;
    const parameter = findSkill(self.skills, SkillType.MIGHTY_BLOW)?.parameter;
    const bonus = Math.abs(parseInt(String(parameter ?? "1"), 10)) || 1;

    ctx.mightyBlow = { playerId: self.id, bonus };
  },
};
