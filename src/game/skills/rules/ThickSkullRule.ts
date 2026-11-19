import { SkillType } from "../../../types/Skills";
import { type SkillRule } from "../SkillRule";

export const ThickSkullRule: SkillRule = {
  onInjuryRoll(ctx, self) {
    if (self.id !== ctx.player.id) return;

    ctx.koDowngrade = {
      playerId: self.id,
      skill: SkillType.THICK_SKULL,
      effect: "Thick Skull: the Knocked-out result is only Stunned",
    };
  },
};
