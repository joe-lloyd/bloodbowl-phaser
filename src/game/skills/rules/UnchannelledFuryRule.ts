import { SkillType } from "../../../types/Skills";
import { type SkillRule } from "../SkillRule";

export const UnchannelledFuryRule: SkillRule = {
  onActivationDeclared(ctx, self) {
    if (self.id !== ctx.player.id) return;
    const angry = ctx.action === "block" || ctx.action === "blitz";
    ctx.gates.push({
      skill: SkillType.UNCHANNELLED_FURY,
      target: 4,
      modifier: angry ? 2 : 0,
      onFail: { kind: "endActivation" },
    });
  },
};
