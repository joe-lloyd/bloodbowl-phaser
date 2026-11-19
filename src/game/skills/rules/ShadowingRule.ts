import { SkillType } from "../../../types/Skills";
import { type Player, PlayerStatus } from "../../../types/Player";
import { type SkillRule } from "../SkillRule";
import { type ReactionDecisionAnswer } from "../../../types/decisions";

type Dodge = Parameters<NonNullable<SkillRule["onDodgeSucceeded"]>>[0];

function mayShadow(ctx: Dodge, self: Player): boolean {
  if (self.id === ctx.player.id) return false;
  if (self.teamId === ctx.player.teamId) return false;
  if (self.status !== PlayerStatus.ACTIVE || !self.gridPosition) return false;

  if (ctx.followInto) return false;

  if (ctx.triggers.some((t) => t.skill === SkillType.SHADOWING)) return false;

  const dx = Math.abs(self.gridPosition.x - ctx.from.x);
  const dy = Math.abs(self.gridPosition.y - ctx.from.y);
  if (dx > 1 || dy > 1 || dx + dy === 0) return false;

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
