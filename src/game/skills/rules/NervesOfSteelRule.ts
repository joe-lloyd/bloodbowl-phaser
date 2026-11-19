import { SkillType } from "../../../types/Skills";
import { type SkillRule } from "../SkillRule";

export const NervesOfSteelRule: SkillRule = {
  onCatch(ctx, self) {
    if (self.id !== ctx.player.id || ctx.marking === 0) return;
    ctx.modifiers += ctx.marking;
    ctx.triggers.push({
      playerId: self.id,
      skill: SkillType.NERVES_OF_STEEL,
      effect: `Nerves of Steel: ignores ${String(ctx.marking)} marking modifier(s) on the catch`,
    });
  },
  onPassDeclared(ctx, self) {
    if (self.id !== ctx.player.id || ctx.marking === 0) return;
    ctx.modifiers += ctx.marking;
    ctx.triggers.push({
      playerId: self.id,
      skill: SkillType.NERVES_OF_STEEL,
      effect: `Nerves of Steel: ignores ${String(ctx.marking)} marking modifier(s) on the pass`,
    });
  },
};
