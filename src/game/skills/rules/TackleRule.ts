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
    // Fires only for a marker of the vacated square (the gather already
    // limits participants to the dodger + those markers)
    if (self.teamId === ctx.player.teamId) return;
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
