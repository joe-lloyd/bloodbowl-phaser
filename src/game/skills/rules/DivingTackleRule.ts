import { SkillType } from "../../../types/Skills";
import { PlayerStatus } from "../../../types/Player";
import { type SkillRule } from "../SkillRule";
import { type ReactionDecisionAnswer } from "../../../types/decisions";

export const DivingTackleRule: SkillRule = {
  async onDodgeResolved(ctx, self) {
    if (self.id === ctx.player.id) return;
    if (self.teamId === ctx.player.teamId) return;
    if (self.status !== PlayerStatus.ACTIVE || !self.gridPosition) return;
    if (ctx.proneInVacated) return;

    const dx = Math.abs(self.gridPosition.x - ctx.from.x);
    const dy = Math.abs(self.gridPosition.y - ctx.from.y);
    if (dx > 1 || dy > 1 || dx + dy === 0) return;

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

  onJumpResolved(ctx, self) {
    return DivingTackleRule.onDodgeResolved?.(ctx, self);
  },
};
