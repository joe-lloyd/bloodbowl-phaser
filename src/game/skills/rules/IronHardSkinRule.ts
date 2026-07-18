/**
 * Iron Hard Skin (2025 p.129) — "Opposition players cannot apply any
 * modifiers when making an Armour Roll against this player. Additionally,
 * the Claws Skill cannot be used against this player."
 *
 * Folds after the causer's rules (victim runs second), so it cancels what
 * Mighty Blow/Claws just applied to the armour roll.
 */

import { SkillType } from "../../../types/Skills";
import { SkillRule } from "../SkillRule";

export const IronHardSkinRule: SkillRule = {
  onArmourBreak(ctx, self) {
    if (self.id !== ctx.player.id) return;
    if (ctx.armourModifier === 0 && !ctx.forcedBreak) return;

    ctx.armourModifier = 0;
    ctx.forcedBreak = false;
    ctx.triggers.push({
      playerId: self.id,
      skill: SkillType.IRON_HARD_SKIN,
      effect: "Iron Hard Skin: armour roll modifiers cancelled",
    });
  },
};
