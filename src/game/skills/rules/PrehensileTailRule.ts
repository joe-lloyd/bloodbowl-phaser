/**
 * Prehensile Tail (2025 rulebook p.133) — "When an opposition player attempts
 * to Dodge, Jump or Leap away from a square in this player's Tackle Zone,
 * they apply an additional -1 modifier to the Agility Test. If a player tries
 * to leave the Tackle Zone of multiple players with this Skill at the same
 * time, only one of those players may use this Skill."
 *
 * `self` is a marker of the vacated square (the dodge fold gathers the
 * dodger's adjacent opponents). Applies -1 once, even with several tails.
 */

import { SkillType } from "../../../types/Skills";
import { SkillRule } from "../SkillRule";

export const PrehensileTailRule: SkillRule = {
  onDodgeDeclared(ctx, self) {
    if (self.id === ctx.player.id) return; // only an opponent's tail applies
    // Only one tail may bite, even when several mark the vacated square.
    if (ctx.triggers.some((t) => t.skill === SkillType.PREHENSILE_TAIL)) return;

    ctx.modifiers -= 1;
    ctx.triggers.push({
      playerId: self.id,
      skill: SkillType.PREHENSILE_TAIL,
      effect: "Prehensile Tail: -1 to the dodge",
    });
  },
};
