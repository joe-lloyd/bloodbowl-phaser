/**
 * Thick Skull (2025 p.137) — "When an Injury Roll is made for this player,
 * they will only be Knocked-out on the roll of a 9; a roll of an 8 will be
 * treated as a Stunned result. If this player also has the Stunty Trait,
 * then they will only be Knocked-out on the roll of an 8; a roll of a 7
 * will be treated as a Stunned result."
 *
 * Both sentences are one effect: the LOWEST Knocked-out total of whichever
 * Injury Table applies is downgraded to Stunned. The rule only declares
 * that downgrade; the operation resolves it against the final table after
 * the fold, so Thick Skull needs no knowledge of Stunty (or any other
 * table-switching rule).
 */

import { SkillType } from "../../../types/Skills";
import { SkillRule } from "../SkillRule";

export const ThickSkullRule: SkillRule = {
  onInjuryRoll(ctx, self) {
    if (self.id !== ctx.player.id) return;

    // Announced by the operation only if the downgrade actually bites.
    ctx.koDowngrade = {
      playerId: self.id,
      skill: SkillType.THICK_SKULL,
      effect: "Thick Skull: the Knocked-out result is only Stunned",
    };
  },
};
