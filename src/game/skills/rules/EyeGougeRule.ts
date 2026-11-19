import { type SkillRule } from "../SkillRule";

export const EyeGougeRule: SkillRule = {
  onPush(ctx, self) {
    if (self.id !== ctx.attacker.id) return;
    ctx.eyeGouge = true;
  },
};
