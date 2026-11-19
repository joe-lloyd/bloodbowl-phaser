import { SkillType } from "../../../types/Skills";
import { type Player, PlayerStatus } from "../../../types/Player";
import { areAdjacent } from "../../elements/GridUtils";
import { type SkillRule, type DodgeDeclaredContext } from "../SkillRule";
import { type ReactionDecisionAnswer } from "../../../types/decisions";

type Escape = Pick<
  DodgeDeclaredContext,
  "player" | "from" | "escapeCancelled" | "triggers" | "decisions" | "dice"
>;

function mayGrip(ctx: Escape, self: Player): boolean {
  if (self.id === ctx.player.id) return false;
  if (self.teamId === ctx.player.teamId) return false;
  if (self.status !== PlayerStatus.ACTIVE || !self.gridPosition) return false;
  if (ctx.escapeCancelled) return false;

  if (!areAdjacent(self.gridPosition, ctx.from)) return false;

  return !ctx.triggers.some((t) => t.skill === SkillType.TENTACLES);
}

async function grip(ctx: Escape, self: Player): Promise<void> {
  if (!ctx.decisions || !ctx.dice || !mayGrip(ctx, self)) return;

  const answer = (await ctx.decisions.request({
    type: "reaction",
    playerId: self.id,
    chooserTeamId: self.teamId,
    skill: SkillType.TENTACLES,
    prompt: `${self.playerName} may grip ${ctx.player.playerName} with Tentacles — try to hold them?`,
  })) as ReactionDecisionAnswer;
  if (!answer.accept) return;

  const roll = ctx.dice.rollD6(`Tentacles (${self.playerName})`, self.teamId);
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
}

export const TentaclesRule: SkillRule = {
  onDodgeDeclared: grip,
  onJumpDeclared: grip,
};
