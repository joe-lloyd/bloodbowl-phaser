/**
 * Shadowing (2025 rulebook p.135) — "Each time an opposing player attempts
 * to Dodge out of a square within this player's Tackle Zone, this player
 * may use this Skill. When this player uses this Skill, roll a D6. On a
 * 1-3, nothing happens. On a 4+, this player is immediately placed into the
 * square that the opposition player vacated. This player may only use this
 * Skill a number of times per Turn equal to their MA. If a player tries to
 * leave the Tackle Zone of multiple players with this Skill at the same
 * time, only one of those players may use this Skill."
 *
 * `self` is a marker of the vacated square, reacting after the dodge (and
 * any Diving Tackle) resolves. The chase is free: no dice for the shadower,
 * who arrives Standing.
 */

import { SkillType } from "../../../types/Skills";
import { PlayerStatus } from "../../../types/Player";
import { SkillRule } from "../SkillRule";
import { ReactionDecisionAnswer } from "../../../types/decisions";

export const ShadowingRule: SkillRule = {
  async onDodgeResolved(ctx, self) {
    if (self.id === ctx.player.id) return;
    if (self.teamId === ctx.player.teamId) return;
    if (self.status !== PlayerStatus.ACTIVE || !self.gridPosition) return;
    // A Diving Tackle already claimed the vacated square, or another
    // shadower got there first
    if (ctx.proneInVacated || ctx.followInto) return;
    // Only one shadower may try, even when several mark the square
    if (ctx.triggers.some((t) => t.skill === SkillType.SHADOWING)) return;
    // Only a marker of the VACATED square may chase
    const dx = Math.abs(self.gridPosition.x - ctx.from.x);
    const dy = Math.abs(self.gridPosition.y - ctx.from.y);
    if (dx > 1 || dy > 1 || dx + dy === 0) return;
    if (!ctx.decisions || !ctx.dice) return;
    // At most MA uses per Turn
    if (
      ctx.arbiter &&
      ctx.arbiter.usesThisTurn(self, SkillType.SHADOWING) >= self.stats.MA
    )
      return;

    const answer = (await ctx.decisions.request({
      type: "reaction",
      playerId: self.id,
      chooserTeamId: self.teamId,
      skill: SkillType.SHADOWING,
      prompt: `${self.playerName} may Shadow ${ctx.player.playerName} (D6, 4+ follows) — use it?`,
    })) as ReactionDecisionAnswer;
    if (!answer.accept) return;

    ctx.arbiter?.consumeUse(self, SkillType.SHADOWING);
    const roll = ctx.dice.rollD6(
      `Shadowing (${self.playerName})`,
      self.teamId
    );
    if (roll >= 4) ctx.followInto = self.id;
    ctx.triggers.push({
      playerId: self.id,
      skill: SkillType.SHADOWING,
      effect:
        roll >= 4
          ? `Shadowing: follows ${ctx.player.playerName} into the vacated square`
          : "Shadowing: fails to follow",
    });
  },
};
