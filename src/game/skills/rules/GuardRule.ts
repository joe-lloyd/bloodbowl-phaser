/**
 * Guard (2025 rulebook p.135) — "This player can provide Offensive and
 * Defensive Assists when a player performs a Block Action regardless of how
 * many opposition players are Marking this player."
 *
 * So a marked Guard player still assists a Block. The rescue can be cancelled
 * by an enemy Defensive marker (folded after, see DefensiveRule).
 */

import { SkillType } from "../../../types/Skills";
import { SkillRule } from "../SkillRule";

export const GuardRule: SkillRule = {
  onCountAssists(ctx, self) {
    if (ctx.action !== "block") return; // Guard helps Blocks only
    if (self.id !== ctx.assister.id) return;
    if (!ctx.negated) return;

    ctx.negated = false;
    ctx.triggers.push({
      playerId: self.id,
      skill: SkillType.GUARD,
      effect: "Guard: assists despite being marked",
    });
  },
};
