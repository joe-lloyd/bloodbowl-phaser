import { SkillType } from "../../../types/Skills";
import { type SkillRule } from "../SkillRule";

export const BoneHeadRule: SkillRule = {
  onActivationDeclared(ctx, self) {
    if (self.id !== ctx.player.id) return;
    ctx.gates.push({
      skill: SkillType.BONE_HEAD,
      target: 2,
      modifier: 0,
      onFail: { kind: "distracted" },
    });
  },
};
