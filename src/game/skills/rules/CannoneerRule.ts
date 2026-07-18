/**
 * Cannoneer (2025 p.126) — "When this player performs a Pass Action which
 * is a Long Pass or a Long Bomb, this player may apply a +1 modifier to
 * the Passing Ability Test."
 */

import { SkillType } from "../../../types/Skills";
import { SkillRule } from "../SkillRule";

export const CannoneerRule: SkillRule = {
  onPassDeclared(ctx, self) {
    if (self.id !== ctx.player.id) return;
    if (ctx.passType !== "Long Pass" && ctx.passType !== "Long Bomb") return;
    ctx.modifiers += 1;
    ctx.triggers.push({
      playerId: self.id,
      skill: SkillType.CANNONEER,
      effect: `Cannoneer: +1 to the ${ctx.passType}`,
    });
  },
};
