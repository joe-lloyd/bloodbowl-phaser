import { SkillType, hasSkill } from "../../../types/Skills";
import { type SkillRule } from "../SkillRule";
import { type ReactionDecisionAnswer } from "../../../types/decisions";

export const SidestepRule: SkillRule = {
  async onPush(ctx, self) {
    if (self.id !== ctx.pushed.id) return;
    if (ctx.refused || ctx.sideStepPush) return;
    if (
      hasSkill(ctx.attacker.skills, SkillType.GRAB) &&
      !ctx.isBlitz &&
      !ctx.chainPush
    )
      return;
    if (!ctx.decisions) return;

    const answer = (await ctx.decisions.request({
      type: "reaction",
      playerId: self.id,
      chooserTeamId: self.teamId,
      skill: SkillType.SIDESTEP,
      prompt: `${self.playerName} is being pushed back — use Sidestep to pick the square?`,
    })) as ReactionDecisionAnswer;
    if (!answer.accept) return;

    ctx.sideStepPush = true;
    ctx.triggers.push({
      playerId: self.id,
      skill: SkillType.SIDESTEP,
      effect: "Sidestep: the pushed player's coach picks the square",
    });
  },
};
