import { SkillType } from "../../../types/Skills";
import { type SkillRule, type JumpDeclaredContext } from "../SkillRule";
import { type Player } from "../../../types/Player";

export const VeryLongLegsRule: SkillRule = {
  onJumpDeclared(ctx: JumpDeclaredContext, self: Player): void {
    if (self.id !== ctx.player.id) return;
    ctx.bonusModifier += 1;
    ctx.triggers.push({
      playerId: self.id,
      skill: SkillType.VERY_LONG_LEGS,
      effect: "Very Long Legs: +1 to the Jump Agility Test",
    });
  },
};
