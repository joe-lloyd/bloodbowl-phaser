/**
 * Nerves of Steel (2025 p.132) — "This player may ignore any modifiers
 * for being Marked when making an Agility Test to Catch the ball, or when
 * making a Passing Ability Test to Pass the ball."
 */

import { SkillType } from "../../../types/Skills";
import { SkillRule } from "../SkillRule";

export const NervesOfSteelRule: SkillRule = {
  onCatch(ctx, self) {
    if (self.id !== ctx.player.id || ctx.marking === 0) return;
    ctx.modifiers += ctx.marking;
    ctx.triggers.push({
      playerId: self.id,
      skill: SkillType.NERVES_OF_STEEL,
      effect: `Nerves of Steel: ignores ${ctx.marking} marking modifier(s) on the catch`,
    });
  },
  onPassDeclared(ctx, self) {
    if (self.id !== ctx.player.id || ctx.marking === 0) return;
    ctx.modifiers += ctx.marking;
    ctx.triggers.push({
      playerId: self.id,
      skill: SkillType.NERVES_OF_STEEL,
      effect: `Nerves of Steel: ignores ${ctx.marking} marking modifier(s) on the pass`,
    });
  },
};
