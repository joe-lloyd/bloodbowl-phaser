/**
 * Stunty (2025 rulebook p.137/p.66) — "When this player attempts to Dodge,
 * they do not suffer any negative modifiers to their Agility Test for being
 * Marked by opposition players. […] if an Injury Roll is made for them,
 * roll on the Stunty Injury Table instead."
 *
 * The rule only declares that the Stunty Injury Table applies; the table's
 * Sevens bands (2-6 Stunned, 7-8 KO, 9-10 Badly Hurt, 11 Seriously Hurt,
 * 12 Dead; docs/SEVENS_RULES.md I1-I5) live in InjuryController,
 * and the operation resolves the final result after the fold — so skills
 * that also adjust the injury roll (Thick Skull) stack without either rule
 * knowing about the other. The -1 Interception clause lands with the
 * interception flow.
 */

import { SkillType } from "../../../types/Skills";
import { SkillRule } from "../SkillRule";

export const StuntyRule: SkillRule = {
  onDodgeDeclared(ctx, self) {
    if (self.id !== ctx.player.id) return;
    if (ctx.markingPenalty >= 0) return;

    ctx.modifiers -= ctx.markingPenalty; // forgive the whole (negative) share
    ctx.markingPenalty = 0;
    ctx.triggers.push({
      playerId: self.id,
      skill: SkillType.STUNTY,
      effect: "Stunty: ignores marking modifiers on the dodge",
    });
  },

  onInjuryRoll(ctx, self) {
    if (self.id !== ctx.player.id) return;

    ctx.table = "stunty";
    ctx.triggers.push({
      playerId: self.id,
      skill: SkillType.STUNTY,
      effect: "Stunty: rolls on the Stunty Injury Table",
    });
  },
};
