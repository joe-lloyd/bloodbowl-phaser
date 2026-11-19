import { SkillType } from "../../../types/Skills";
import { type SkillRule } from "../SkillRule";
import { type ReactionDecisionAnswer } from "../../../types/decisions";

export const StandFirmRule: SkillRule = {
  async onPush(ctx, self) {
    if (self.id !== ctx.pushed.id) return;
    if (ctx.refused) return;
    if (ctx.blockerIgnoresReactions) return;
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
