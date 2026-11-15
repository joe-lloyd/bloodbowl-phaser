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
 * `self` is a marker of the vacated square. FAQ (May 2026): Diving Tackle
 * reacts first, and "If the Dodge is successful, a Shadowing roll can be
 * made", so this folds only on a dodge that stood. The chase is free: no
 * dice for the shadower, who arrives Standing.
 */

import { SkillType } from "../../../types/Skills";
import { Player, PlayerStatus } from "../../../types/Player";
import { SkillRule } from "../SkillRule";
import { ReactionDecisionAnswer } from "../../../types/decisions";

type Dodge = Parameters<NonNullable<SkillRule["onDodgeSucceeded"]>>[0];

/**
 * Whether `self` may try to Shadow this dodge: a Standing opponent who
 * marked the vacated square, with uses left this Turn, and no other
 * shadower has tried.
 */
function mayShadow(ctx: Dodge, self: Player): boolean {
  if (self.id === ctx.player.id) return false;
  if (self.teamId === ctx.player.teamId) return false;
  if (self.status !== PlayerStatus.ACTIVE || !self.gridPosition) return false;
  // Another shadower got there first
  if (ctx.followInto) return false;
  // Only one shadower may try, even when several mark the square
  if (ctx.triggers.some((t) => t.skill === SkillType.SHADOWING)) return false;
  // Only a marker of the VACATED square may chase
  const dx = Math.abs(self.gridPosition.x - ctx.from.x);
  const dy = Math.abs(self.gridPosition.y - ctx.from.y);
  if (dx > 1 || dy > 1 || dx + dy === 0) return false;
  // At most MA uses per Turn
  return (
    !ctx.arbiter ||
    ctx.arbiter.usesThisTurn(self, SkillType.SHADOWING) < self.stats.MA
  );
}

export const ShadowingRule: SkillRule = {
  async onDodgeSucceeded(ctx, self) {
    if (!ctx.decisions || !ctx.dice || !mayShadow(ctx, self)) return;

    const answer = (await ctx.decisions.request({
      type: "reaction",
      playerId: self.id,
      chooserTeamId: self.teamId,
      skill: SkillType.SHADOWING,
      prompt: `${self.playerName} may Shadow ${ctx.player.playerName} (D6, 4+ follows) — use it?`,
    })) as ReactionDecisionAnswer;
    if (!answer.accept) return;

    ctx.arbiter?.consumeUse(self, SkillType.SHADOWING);
    const roll = ctx.dice.rollD6(`Shadowing (${self.playerName})`, self.teamId);
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
