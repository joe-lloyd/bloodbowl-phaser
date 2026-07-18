/**
 * Claws (2025 p.127) — "Whenever an Armour Roll is made for an opposition
 * player that has been Knocked Down by this player during a Block Action,
 * even if this player is also Knocked Down, then any roll of a natural 8+
 * on the Armour Roll will break the opposition player's armour regardless
 * of their actual Armour Value."
 */

import { SkillType } from "../../../types/Skills";
import { SkillRule } from "../SkillRule";

export const ClawsRule: SkillRule = {
  onArmourBreak(ctx, self) {
    if (!ctx.causedBy || self.id !== ctx.causedBy.id) return;
    if (ctx.roll < 8) return;
    if (ctx.roll >= ctx.player.stats.AV) return; // broke anyway

    ctx.forcedBreak = true;
    ctx.triggers.push({
      playerId: self.id,
      skill: SkillType.CLAWS,
      effect: `Claws: natural ${ctx.roll} breaks armour regardless of AV`,
    });
  },
};
