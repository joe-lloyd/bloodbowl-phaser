import { SkillType } from "../../../types/Skills";
import { type SkillRule } from "../SkillRule";

export const BloodlustRule: SkillRule = {
  onActivationDeclared(ctx, self) {
    if (self.id !== ctx.player.id) return;
    const instance = self.skills.find((s) => s.type === SkillType.BLOODLUST);
    const threshold = parseInt(String(instance?.parameter ?? "3"), 10) || 3;
    const angry = ctx.action === "block" || ctx.action === "blitz";
    ctx.gates.push({
      skill: SkillType.BLOODLUST,
      target: threshold,
      modifier: angry ? 1 : 0,
      onFail: { kind: "bloodlust" },
    });
  },
};
