/**
 * Taunt (2025 rulebook p.136) — "When a player with this Skill is Pushed
 * Back as a result of a Block Action performed against them, this player's
 * Coach may choose to make the opposition player Follow-up." (The Take
 * Root exception lands with the Take Root trait.)
 *
 * Accepting forces the blocker's follow-up: no follow-up choice is offered
 * and the blocker moves into the vacated square when the push settles.
 */

import { SkillType } from "../../../types/Skills";
import { SkillRule } from "../SkillRule";
import { ReactionDecisionAnswer } from "../../../types/decisions";

export const TauntRule: SkillRule = {
  async onPush(ctx, self) {
    if (self.id !== ctx.pushed.id) return;
    if (ctx.refused || ctx.forceFollowUp) return;
    if (ctx.preventFollowUp) return; // Fend already denied the follow-up
    if (!ctx.decisions) return;

    const answer = (await ctx.decisions.request({
      type: "reaction",
      playerId: self.id,
      chooserTeamId: self.teamId,
      skill: SkillType.TAUNT,
      prompt: `${self.playerName} taunts the blocker — force them to follow up?`,
    })) as ReactionDecisionAnswer;
    if (!answer.accept) return;

    ctx.forceFollowUp = true;
    ctx.triggers.push({
      playerId: self.id,
      skill: SkillType.TAUNT,
      effect: "Taunt: the blocker must follow up",
    });
  },
};
