/**
 * Defensive (2025 rulebook p.121) — "During your opponent's Turns,
 * opposition players Marked by this player cannot use the Guard or Put the
 * Boot In Skills."
 *
 * Folded after Guard: if this Defensive player marks the assister and it is
 * this player's opponent's turn (the assister's team is active), it cancels
 * the Guard rescue, re-negating the marked assist. (The Put the Boot In
 * clause lands with the fouling batch.)
 */

import { SkillType } from "../../../types/Skills";
import { SkillRule } from "../SkillRule";

export const DefensiveRule: SkillRule = {
  onCountAssists(ctx, self) {
    if (self.id === ctx.assister.id) return; // Defensive acts as a marker
    if (ctx.negated) return; // only meaningful if Guard rescued the assist
    // Defensive bites only on its own opponent's (the assister's) Turn.
    if (ctx.activeTeamId !== ctx.assister.teamId) return;

    ctx.negated = true;
    ctx.triggers.push({
      playerId: self.id,
      skill: SkillType.DEFENSIVE,
      effect: "Defensive: cancels the marked player's Guard",
    });
  },
};
