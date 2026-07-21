/**
 * Diving Tackle (2025 rulebook p.127) — "When an opposition player attempts
 * to leave this player's Tackle Zone as a result of a Dodge, Leap or Jump,
 * after the Agility Test has been rolled and any modifiers and re-rolls
 * have been applied, this player may use this Skill. Immediately apply a -2
 * modifier to the opposition player's Agility Test and place this player
 * Prone in the square the opposition player vacated. If a player tries to
 * leave the Tackle Zone of multiple players with this Skill at the same
 * time, only one of those players may use this Skill."
 *
 * `self` is a marker of the vacated square, reacting AFTER re-rolls. Only
 * offered when the -2 actually turns the success into a failure (a natural
 * 6 always succeeds, and a failed test needs no help failing).
 */

import { SkillType } from "../../../types/Skills";
import { PlayerStatus } from "../../../types/Player";
import { SkillRule } from "../SkillRule";
import { ReactionDecisionAnswer } from "../../../types/decisions";

export const DivingTackleRule: SkillRule = {
  async onDodgeResolved(ctx, self) {
    if (self.id === ctx.player.id) return;
    if (self.teamId === ctx.player.teamId) return;
    if (self.status !== PlayerStatus.ACTIVE || !self.gridPosition) return;
    if (ctx.proneInVacated) return; // only one diver per dodge
    // Only a marker of the VACATED square may dive after the dodger
    const dx = Math.abs(self.gridPosition.x - ctx.from.x);
    const dy = Math.abs(self.gridPosition.y - ctx.from.y);
    if (dx > 1 || dy > 1 || dx + dy === 0) return;
    // The -2 must flip the outcome for the dive to achieve anything
    if (!ctx.success || ctx.naturalRoll === 6) return;
    if (ctx.naturalRoll + ctx.modifiers - 2 >= ctx.target) return;
    if (!ctx.decisions) return;

    const answer = (await ctx.decisions.request({
      type: "reaction",
      playerId: self.id,
      chooserTeamId: self.teamId,
      skill: SkillType.DIVING_TACKLE,
      prompt: `${self.playerName} may Diving Tackle ${ctx.player.playerName} (-2, ${self.playerName} drops Prone) — use it?`,
    })) as ReactionDecisionAnswer;
    if (!answer.accept) return;

    ctx.modifiers -= 2;
    ctx.success = false;
    ctx.proneInVacated = self.id;
    ctx.triggers.push({
      playerId: self.id,
      skill: SkillType.DIVING_TACKLE,
      effect: `Diving Tackle: -2 brings ${ctx.player.playerName} down`,
    });
  },
};
