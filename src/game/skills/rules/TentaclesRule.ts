/**
 * Tentacles (2025 rulebook p.137) — "When an opposition player attempts to
 * Dodge, Jump or Leap away from a square in this player's Tackle Zone, this
 * player may use this Skill. When a player uses this Skill they roll a D6
 * and add their Strength Characteristic to the roll; they then subtract the
 * Strength Characteristic of the opposition player from the result. If the
 * result is 6 or higher, or the roll is a natural 6, then the opposition
 * player does not leave the square they attempted to leave and their
 * activation comes to an end. If the result is 5 or lower, or the roll is a
 * natural 1, this Skill has no effect. If a player tries to leave the
 * Tackle Zone of multiple players with this Skill at the same time, only
 * one of those players may use this Skill."
 *
 * `self` is a marker of the vacated square. Fires before the Agility Test:
 * a hold means no dodge is rolled at all.
 */

import { SkillType } from "../../../types/Skills";
import { PlayerStatus } from "../../../types/Player";
import { SkillRule } from "../SkillRule";
import { ReactionDecisionAnswer } from "../../../types/decisions";

export const TentaclesRule: SkillRule = {
  async onDodgeDeclared(ctx, self) {
    if (self.id === ctx.player.id) return;
    if (self.teamId === ctx.player.teamId) return;
    if (self.status !== PlayerStatus.ACTIVE || !self.gridPosition) return;
    if (ctx.escapeCancelled) return;
    // Only a marker of the VACATED square may grip the dodger
    const dx = Math.abs(self.gridPosition.x - ctx.from.x);
    const dy = Math.abs(self.gridPosition.y - ctx.from.y);
    if (dx > 1 || dy > 1 || dx + dy === 0) return;
    // Only one set of tentacles may try, even when several mark the square
    if (ctx.triggers.some((t) => t.skill === SkillType.TENTACLES)) return;
    if (!ctx.decisions || !ctx.dice) return;

    const answer = (await ctx.decisions.request({
      type: "reaction",
      playerId: self.id,
      chooserTeamId: self.teamId,
      skill: SkillType.TENTACLES,
      prompt: `${self.playerName} may grip ${ctx.player.playerName} with Tentacles — try to hold them?`,
    })) as ReactionDecisionAnswer;
    if (!answer.accept) return;

    const roll = ctx.dice.rollD6(
      `Tentacles (${self.playerName})`,
      self.teamId
    );
    const result = roll + self.stats.ST - ctx.player.stats.ST;
    const held = roll !== 1 && (roll === 6 || result >= 6);

    if (held) ctx.escapeCancelled = true;
    ctx.triggers.push({
      playerId: self.id,
      skill: SkillType.TENTACLES,
      effect: held
        ? `Tentacles: ${ctx.player.playerName} is held fast — their activation ends`
        : "Tentacles: fails to hold",
    });
  },
};
