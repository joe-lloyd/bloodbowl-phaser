/**
 * Juggernaut (2025 rulebook p.136) — "When this player performs a Block
 * Action as part of a Blitz Action, they may treat any result of Both Down as
 * Pushed Back. Additionally, when this player performs a Block Action as part
 * of a Blitz Action, opposition players cannot use the Fend, Stand Firm or
 * Wrestle Skills."
 *
 * `self` is the attacker. On a Blitz it converts a Both Down into a push
 * (via the block-result fold) and suppresses the defender's push/result
 * reactions (Fend and Stand Firm via the push flag, Wrestle via the result
 * flag).
 */

import { SkillType } from "../../../types/Skills";
import { SkillRule } from "../SkillRule";

export const JuggernautRule: SkillRule = {
  onBlockResult(ctx, self) {
    if (self.id !== ctx.attacker.id || !ctx.isBlitz) return;
    ctx.suppressReactions = true; // cancels Wrestle
    if (ctx.resultType === "both-down") {
      ctx.treatAsPush = true;
      ctx.triggers.push({
        playerId: self.id,
        skill: SkillType.JUGGERNAUT,
        effect: "Juggernaut: Both Down treated as a Push Back",
      });
    }
  },

  onPush(ctx, self) {
    if (self.id !== ctx.attacker.id || !ctx.isBlitz) return;
    ctx.blockerIgnoresReactions = true; // cancels Fend and Stand Firm
  },
};
