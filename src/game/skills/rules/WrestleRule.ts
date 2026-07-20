/**
 * Wrestle (2025 rulebook p.141) — "When this player performs a Block
 * Action, or is the target of a Block Action, if the Both Down result is
 * selected then this player can choose to use this Skill. If they do, both
 * players in the Block Action are Placed Prone, regardless of any other
 * Skills they may possess."
 *
 * Placed Prone (p.42): no armour rolls; the ball bounces from a prone
 * carrier; a turnover only if the active player carried the ball.
 */

import { SkillType } from "../../../types/Skills";
import { SkillRule } from "../SkillRule";
import { ReactionDecisionAnswer } from "../../../types/decisions";

export const WrestleRule: SkillRule = {
  async onBlockResult(ctx, self) {
    if (ctx.resultType !== "both-down") return;
    // Only the two players in the block may wrestle, one use per block
    if (self.id !== ctx.attacker.id && self.id !== ctx.defender.id) return;
    if (ctx.placedProne) return;
    if (ctx.suppressReactions) return; // Juggernaut on a Blitz
    if (!ctx.decisions) return;

    const answer = (await ctx.decisions.request({
      type: "reaction",
      playerId: self.id,
      chooserTeamId: self.teamId,
      skill: SkillType.WRESTLE,
      prompt: `Use ${self.playerName}'s Wrestle to place both players prone (no armour rolls)?`,
    })) as ReactionDecisionAnswer;
    if (!answer.accept) return;

    // "Regardless of any other Skills" — overrides Block's stay-up
    ctx.attackerKnockedDown = true;
    ctx.defenderKnockedDown = true;
    ctx.placedProne = true;
    ctx.triggers.push({
      playerId: self.id,
      skill: SkillType.WRESTLE,
      effect: "Wrestle: both players placed prone, no armour rolls",
    });
  },
};
