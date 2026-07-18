/**
 * Mighty Blow (2025 p.131) — "Whenever this player Knocks Down an
 * opposition player during a Block Action, even if this player is also
 * Knocked Down, they may apply a +1 modifier to either the Armour Roll or
 * Injury Roll. This modifier may be applied after the roll has been made."
 *
 * Auto-optimized: the bonus goes to the armour roll when it flips the
 * break, otherwise it is saved for the injury roll. Parameter-aware
 * (legacy "Mighty Blow (+2)" instances carry parameter "+2").
 */

import { SkillType, findSkill } from "../../../types/Skills";
import { SkillRule } from "../SkillRule";

export const MightyBlowRule: SkillRule = {
  onArmourBreak(ctx, self) {
    if (!ctx.causedBy || self.id !== ctx.causedBy.id) return;
    const parameter = findSkill(self.skills, SkillType.MIGHTY_BLOW)?.parameter;
    const bonus = Math.abs(parseInt(String(parameter ?? "1"), 10)) || 1;

    const av = ctx.player.stats.AV;
    const breaksAlready =
      ctx.forcedBreak || ctx.roll + ctx.armourModifier >= av;
    if (!breaksAlready && ctx.roll + ctx.armourModifier + bonus >= av) {
      ctx.armourModifier += bonus;
      ctx.triggers.push({
        playerId: self.id,
        skill: SkillType.MIGHTY_BLOW,
        effect: `Mighty Blow: +${bonus} to the armour roll`,
      });
    } else {
      ctx.injuryModifier += bonus;
      ctx.triggers.push({
        playerId: self.id,
        skill: SkillType.MIGHTY_BLOW,
        effect: `Mighty Blow: +${bonus} saved for the injury roll`,
      });
    }
  },
};
