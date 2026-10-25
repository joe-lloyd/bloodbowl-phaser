/**
 * Tackle (2025 rulebook p.140) — "When an opposition player attempts to
 * Dodge away from a square in this player's Tackle Zone, they cannot use
 * the Dodge Skill." The Stumble half of Tackle lives in DodgeRule, which
 * checks the attacker for Tackle when converting a Defender Stumbles.
 */

import { SkillType, hasSkill } from "../../../types/Skills";
import { SkillRule } from "../SkillRule";

export const TackleRule: SkillRule = {
  onDodgeDeclared(ctx, self) {
    // Fires only for a marker of the vacated square. The dodge fold also
    // gathers markers of the destination (for Titchy), so check adjacency.
    if (self.teamId === ctx.player.teamId) return;
    if (!self.gridPosition) return;
    const dx = Math.abs(self.gridPosition.x - ctx.from.x);
    const dy = Math.abs(self.gridPosition.y - ctx.from.y);
    if (dx > 1 || dy > 1) return;
    if (!ctx.skillRerollAllowed) return;

    ctx.skillRerollAllowed = false;
    if (hasSkill(ctx.player.skills, SkillType.DODGE)) {
      ctx.triggers.push({
        playerId: self.id,
        skill: SkillType.TACKLE,
        effect: "Tackle: denies the Dodge skill re-roll",
      });
    }
  },
};
