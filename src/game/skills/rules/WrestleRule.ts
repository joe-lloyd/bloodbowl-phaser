import { SkillType } from "../../../types/Skills";
import { type SkillRule } from "../SkillRule";
import { type ReactionDecisionAnswer } from "../../../types/decisions";

export const WrestleRule: SkillRule = {
  async onBlockResult(ctx, self) {
    if (ctx.resultType !== "both-down") return;

    if (self.id !== ctx.attacker.id && self.id !== ctx.defender.id) return;
    if (ctx.placedProne) return;

    if (ctx.suppressReactions && self.id !== ctx.attacker.id) return;
    if (!ctx.decisions) return;

    const answer = (await ctx.decisions.request({
      type: "reaction",
      playerId: self.id,
      chooserTeamId: self.teamId,
      skill: SkillType.WRESTLE,
      prompt: `Use ${self.playerName}'s Wrestle to place both players prone (no armour rolls)?`,
      opponentId: self.id === ctx.attacker.id ? ctx.defender.id : ctx.attacker.id,
    })) as ReactionDecisionAnswer;
    if (!answer.accept) return;

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
