import { SkillType } from "../../../types/Skills";
import { type SkillRule, type JumpDeclaredContext } from "../SkillRule";
import { type Player } from "../../../types/Player";

export const LeapRule: SkillRule = {
  onJumpDeclared(ctx: JumpDeclaredContext, self: Player): void {
    if (self.id !== ctx.player.id) return;
    if (ctx.negativeModifier >= 0) return;
    const softened = Math.min(ctx.negativeModifier + 1, -1);
    if (softened === ctx.negativeModifier) return;
    ctx.negativeModifier = softened;
    ctx.triggers.push({
      playerId: self.id,
      skill: SkillType.LEAP,
      effect: "Leap: negative Jump modifier reduced by 1 (min -1)",
    });
  },
};
