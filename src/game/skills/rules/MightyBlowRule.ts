/**
 * Mighty Blow (2025 p.131) — "Whenever this player Knocks Down an
 * opposition player during a Block Action, even if this player is also
 * Knocked Down, they may apply a +1 modifier to either the Armour Roll or
 * Injury Roll. This modifier may be applied after the roll has been made."
 *
 * Only a Block Action's knockdown (or an Animal Savagery lash-out, which
 * must use it). Auto-optimized after the whole fold: the bonus goes to the
 * armour roll when it flips the break, otherwise it is saved for the
 * injury roll. Parameter-aware (legacy "Mighty Blow (+2)" instances carry
 * parameter "+2").
 */

import { SkillType, findSkill } from "../../../types/Skills";
import { SkillRule } from "../SkillRule";

export const MightyBlowRule: SkillRule = {
  onArmourBreak(ctx, self) {
    if (!ctx.causedBy || self.id !== ctx.causedBy.id) return;
    if (ctx.cause !== "block" && ctx.cause !== "lash-out") return;
    const parameter = findSkill(self.skills, SkillType.MIGHTY_BLOW)?.parameter;
    const bonus = Math.abs(parseInt(String(parameter ?? "1"), 10)) || 1;
    // Placed by foldArmourRoll once Claws / Iron Hard Skin have folded.
    ctx.mightyBlow = { playerId: self.id, bonus };
  },
};
