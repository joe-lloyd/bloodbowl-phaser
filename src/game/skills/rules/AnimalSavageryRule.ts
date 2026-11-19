import { SkillType } from "../../../types/Skills";
import { type SkillRule } from "../SkillRule";

export const AnimalSavageryRule: SkillRule = {
  onActivationDeclared(ctx, self) {
    if (self.id !== ctx.player.id) return;
    const angry = ctx.action === "block" || ctx.action === "blitz";
    ctx.gates.push({
      skill: SkillType.ANIMAL_SAVAGERY,
      target: 4,
      modifier: angry ? 2 : 0,
      onFail: { kind: "lashOut" },
    });
  },
};
