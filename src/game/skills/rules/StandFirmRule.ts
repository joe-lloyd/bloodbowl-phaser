/**
 * Stand Firm (2025 rulebook p.139) — "When this player would be Pushed
 * Back during a Block Action, including during a Chain Push, they can
 * choose to not be Pushed Back and instead remain in their current
 * square." On a POW the refusing player is still knocked down — in place.
 */

import { SkillType } from "../../../types/Skills";
import { SkillRule } from "../SkillRule";
import { ReactionDecisionAnswer } from "../../../types/decisions";

export const StandFirmRule: SkillRule = {
  async onPush(ctx, self) {
    if (self.id !== ctx.pushed.id) return;
    if (ctx.refused) return;
    if (ctx.blockerIgnoresReactions) return; // Juggernaut on a Blitz
    if (!ctx.decisions) return;

    const answer = (await ctx.decisions.request({
      type: "reaction",
      playerId: self.id,
      chooserTeamId: self.teamId,
      skill: SkillType.STAND_FIRM,
      prompt: `${self.playerName} is being pushed back — use Stand Firm to stay put?`,
    })) as ReactionDecisionAnswer;
    if (!answer.accept) return;

    ctx.refused = true;
    ctx.triggers.push({
      playerId: self.id,
      skill: SkillType.STAND_FIRM,
      effect: "Stand Firm: refuses the push",
    });
  },
};
