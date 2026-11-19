import { SkillType } from "../../../types/Skills";
import { type Player } from "../../../types/Player";
import { type SkillRule, type PassDeclaredContext, type CatchContext } from "../SkillRule";

function auraApplies(self: Player, target: Player): boolean {
  if (self.teamId === target.teamId) return false;
  if (!self.gridPosition || !target.gridPosition) return false;
  const dx = Math.abs(self.gridPosition.x - target.gridPosition.x);
  const dy = Math.abs(self.gridPosition.y - target.gridPosition.y);
  return dx <= 3 && dy <= 3;
}

function disturb(
  ctx: PassDeclaredContext | CatchContext,
  self: Player,
  test: string
): void {
  if (!auraApplies(self, ctx.player)) return;
  ctx.modifiers -= 1;
  ctx.triggers.push({
    playerId: self.id,
    skill: SkillType.DISTURBING_PRESENCE,
    effect: `Disturbing Presence: -1 to the ${test}`,
  });
}

export const DisturbingPresenceRule: SkillRule = {
  onPassDeclared(ctx, self) {
    disturb(ctx, self, "Passing Ability Test");
  },
  onCatch(ctx, self) {
    disturb(ctx, self, "catch");
  },
};
