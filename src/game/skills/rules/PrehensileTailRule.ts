/**
 * Prehensile Tail (2025 rulebook p.133) — "When an opposition player attempts
 * to Dodge, Jump or Leap away from a square in this player's Tackle Zone,
 * they apply an additional -1 modifier to the Agility Test. If a player tries
 * to leave the Tackle Zone of multiple players with this Skill at the same
 * time, only one of those players may use this Skill."
 *
 * `self` may mark the vacated or the destination square; only a marker of
 * the vacated square applies. Applies -1 once, even with several tails.
 */

import { SkillType } from "../../../types/Skills";
import { SkillRule } from "../SkillRule";

export const PrehensileTailRule: SkillRule = {
  onDodgeDeclared(ctx, self) {
    if (self.teamId === ctx.player.teamId) return; // only an opponent's tail applies
    // The dodge fold also gathers markers of the destination (for Titchy);
    // only a tail marking the vacated square bites.
    if (!self.gridPosition) return;
    const dx = Math.abs(self.gridPosition.x - ctx.from.x);
    const dy = Math.abs(self.gridPosition.y - ctx.from.y);
    if (dx > 1 || dy > 1) return;
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
