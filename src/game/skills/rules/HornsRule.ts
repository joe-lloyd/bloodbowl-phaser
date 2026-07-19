/**
 * Horns (2025 rulebook p.130) — "Whenever this player declares a Blitz
 * Action, then they apply a +1 modifier to their Strength Characteristic for
 * any Block Actions performed during that Blitz Action."
 *
 * Raises the attacker's effective strength by 1 on a Blitz block; the block
 * dice are recomputed from the new strengths.
 */

import { SkillType } from "../../../types/Skills";
import { SkillRule } from "../SkillRule";

export const HornsRule: SkillRule = {
  onBlockDeclared(ctx, self) {
    if (self.id !== ctx.attacker.id || !ctx.isBlitz) return;
    ctx.attackerStrength += 1;
    ctx.triggers.push({
      playerId: self.id,
      skill: SkillType.HORNS,
      effect: "Horns: +1 Strength on the Blitz block",
    });
  },
};
