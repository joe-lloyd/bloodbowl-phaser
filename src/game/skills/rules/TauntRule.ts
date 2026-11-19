import { SkillType } from "../../../types/Skills";
import { type SkillRule } from "../SkillRule";
import { type ReactionDecisionAnswer } from "../../../types/decisions";

export const TauntRule: SkillRule = {
  async onPush(ctx, self) {
    if (self.id !== ctx.pushed.id || ctx.chainPush) return;
    if (ctx.refused || ctx.forceFollowUp) return;
    if (ctx.preventFollowUp) return;
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
