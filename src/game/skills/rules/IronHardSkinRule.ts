import { SkillType } from "../../../types/Skills";
import { type SkillRule } from "../SkillRule";

export const IronHardSkinRule: SkillRule = {
  onArmourBreak(ctx, self) {
    if (self.id !== ctx.player.id) return;
    ctx.modifiersLocked = true;
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
