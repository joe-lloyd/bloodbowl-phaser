/**
 * Hatred (X) (2025 rulebook p.129, trait) — "Whenever this player performs
 * a Block Action against a player with the same keyword as that shown in
 * brackets, this player may re-roll a single Player Down result."
 *
 * After the block dice land, the attacker's coach may re-roll exactly one
 * "skull" (Player Down) die in place. (Brawler's Both Down re-roll used to
 * work the same way via this hook; it is now a button on the block-dice
 * decision instead — see BlockManager.brawlerRerollBlockDie.)
 */

import { SkillType } from "../../../types/Skills";
import { SkillRule } from "../SkillRule";
import { ReactionDecisionAnswer } from "../../../types/decisions";
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

    ctx.results[index] = ctx.dice.rollBlockDice(1, self.teamId)[0];
    ctx.triggers.push({
      playerId: self.id,
      skill: SkillType.HATRED,
      effect: "Hatred: re-rolled a Player Down",
    });
  },
};
