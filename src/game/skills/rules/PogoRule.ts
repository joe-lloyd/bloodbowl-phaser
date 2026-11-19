import { SkillType } from "../../../types/Skills";
import { type SkillRule, type JumpDeclaredContext } from "../SkillRule";
import { type Player } from "../../../types/Player";

export const PogoRule: SkillRule = {
  onJumpDeclared(ctx: JumpDeclaredContext, self: Player): void {
    if (self.id !== ctx.player.id) return;
    if (ctx.negativeModifier >= 0) return;
    ctx.negativeModifier = 0;
    ctx.triggers.push({
      playerId: self.id,
      skill: SkillType.POGO,
      effect: "Pogo: ignores all negative Jump modifiers",
    });
  },
};
