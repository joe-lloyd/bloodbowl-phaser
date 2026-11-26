import { SkillType } from "../../../types/Skills";
import { type SkillRule } from "../SkillRule";

export const JuggernautRule: SkillRule = {
  onBlockResult(ctx, self) {
    if (self.id !== ctx.attacker.id || !ctx.isBlitz) return;
    ctx.suppressReactions = true;
    if (ctx.resultType !== "both-down") {
      return;
    }

    ctx.treatAsPush = true;
    ctx.triggers.push({
      playerId: self.id,
      skill: SkillType.JUGGERNAUT,
      effect: "Juggernaut: Both Down treated as a Push Back",
    });
  },

  onPush(ctx, self) {
    if (self.id !== ctx.attacker.id || !ctx.isBlitz) return;
    ctx.blockerIgnoresReactions = true;
  },
};
