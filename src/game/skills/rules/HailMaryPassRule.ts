import { SkillType } from "../../../types/Skills";
import { type SkillRule, type PassDeclaredContext } from "../SkillRule";
import { type Player } from "../../../types/Player";

export const HailMaryPassRule: SkillRule = {
  onPassDeclared(ctx: PassDeclaredContext, self: Player): void {
    if (self.id !== ctx.player.id || !ctx.hailMary) return;
    ctx.suppressInterception = true;
    ctx.triggers.push({
      playerId: self.id,
      skill: SkillType.HAIL_MARY_PASS,
      effect: "Hail Mary Pass: Accurate → Inaccurate, cannot be Intercepted",
    });
  },
};
