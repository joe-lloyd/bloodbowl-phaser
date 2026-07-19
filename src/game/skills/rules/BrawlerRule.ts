/**
 * Brawler (2025 rulebook p.127) — "When this player declares a Block Action,
 * they may re-roll a single Both Down result."
 *
 * `self` is the attacker. If any die shows Both Down, the attacker's coach may
 * re-roll exactly one of them; the new die replaces it in place before the
 * result is chosen.
 */

import { SkillType } from "../../../types/Skills";
import { SkillRule } from "../SkillRule";
import { ReactionDecisionAnswer } from "../../../types/decisions";

export const BrawlerRule: SkillRule = {
  async onBlockDiceRolled(ctx, self) {
    if (self.id !== ctx.attacker.id || !ctx.dice) return;
    const index = ctx.results.findIndex((r) => r.type === "both-down");
    if (index < 0) return;

    if (ctx.decisions) {
      const answer = (await ctx.decisions.request({
        type: "reaction",
        playerId: self.id,
        chooserTeamId: self.teamId,
        skill: SkillType.BRAWLER,
        prompt: `${self.playerName} may use Brawler to re-roll a Both Down — re-roll it?`,
      })) as ReactionDecisionAnswer;
      if (!answer.accept) return;
    }

    ctx.results[index] = ctx.dice.rollBlockDice(1, self.teamId)[0];
    ctx.triggers.push({
      playerId: self.id,
      skill: SkillType.BRAWLER,
      effect: "Brawler: re-rolled a Both Down",
    });
  },
};
