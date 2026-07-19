/**
 * Fend (2025 rulebook p.129) — "When a player with this Skill is Pushed Back
 * as a result of a Block Action performed against them, then the opposition
 * player may not Follow-up. This Skill cannot be used against a player with
 * the Ball & Chain Trait or against a player with the Juggernaut Skill that
 * is performing a Blitz Action."
 *
 * `self` is the pushed player. Sets the flag that denies the blocker their
 * follow-up. (The Juggernaut-on-a-Blitz exception is applied by Juggernaut,
 * which folds first as the attacker and clears this flag; Ball & Chain is a
 * later batch.)
 */

import { SkillType } from "../../../types/Skills";
import { SkillRule } from "../SkillRule";

export const FendRule: SkillRule = {
  onPush(ctx, self) {
    if (self.id !== ctx.pushed.id) return;
    if (ctx.blockerIgnoresReactions) return; // Juggernaut on a Blitz
    ctx.preventFollowUp = true;
    ctx.triggers.push({
      playerId: self.id,
      skill: SkillType.FEND,
      effect: "Fend: the blocker may not follow up",
    });
  },
};
