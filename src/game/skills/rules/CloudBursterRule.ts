import { SkillType } from "../../../types/Skills";
import { type SkillRule, type PassDeclaredContext } from "../SkillRule";
import { type Player } from "../../../types/Player";

export const CloudBursterRule: SkillRule = {
  onPassDeclared(ctx: PassDeclaredContext, self: Player): void {
    if (self.id !== ctx.player.id) return;
    ctx.cloudBurster = true;
    ctx.triggers.push({
      playerId: self.id,
      skill: SkillType.CLOUD_BURSTER,
      effect: "Cloud Burster: only Very Long Legs may Intercept",
    });
  },
};
