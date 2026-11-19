import { SkillType } from "../../../types/Skills";
import { type SkillRule } from "../SkillRule";
import { type ReactionDecisionAnswer } from "../../../types/decisions";
import { matchesKeyword } from "./keywords";

export const HatredRule: SkillRule = {
  async onBlockDiceRolled(ctx, self) {
    if (self.id !== ctx.attacker.id || !ctx.dice) return;
    const instance = self.skills.find((s) => s.type === SkillType.HATRED);
    if (!matchesKeyword(ctx.defender, instance?.parameter)) return;
    const index = ctx.results.findIndex((r) => r.type === "skull");
    if (index < 0) return;

    if (ctx.decisions) {
      const answer = (await ctx.decisions.request({
        type: "reaction",
        playerId: self.id,
        chooserTeamId: self.teamId,
        skill: SkillType.HATRED,
        prompt: `${self.playerName} hates ${ctx.defender.playerName}'s kind — re-roll a Player Down?`,
      })) as ReactionDecisionAnswer;
      if (!answer.accept) return;
    }

    const before = ctx.results.map((r) => r.label);
    const [reroll] = ctx.dice.rollBlockDice(1, self.teamId);
    if (!reroll) throw new Error("Block dice roll returned no result");
    ctx.results[index] = reroll;
    ctx.rerolls.push({
      skill: SkillType.HATRED,
      before,
      after: ctx.results.map((r) => r.label),
    });
    ctx.triggers.push({
      playerId: self.id,
      skill: SkillType.HATRED,
      effect: "Hatred: re-rolled a Player Down",
    });
  },
};
