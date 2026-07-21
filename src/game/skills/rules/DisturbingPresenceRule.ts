/**
 * Disturbing Presence (2025 rulebook p.127) — "Any opposition player that
 * performs a Pass Action, Throw Team-mate Action or a Throw Bomb Special
 * Action, or attempts to Intercept or Catch the ball, applies a -1 modifier
 * to the Passing Ability Test or Agility Test for each player on your team
 * with this Skill within 3 squares of them."
 *
 * `self` is any player within 3 squares of the passer/catcher (the pass and
 * catch folds gather that aura). Each Disturbing Presence player stacks its
 * own -1; the skill is passive, so it works even while Prone or Stunned.
 * The Throw Team-mate / Throw Bomb / Interception clauses land with those
 * subsystems.
 */

import { SkillType } from "../../../types/Skills";
import { Player } from "../../../types/Player";
import { SkillRule, PassDeclaredContext, CatchContext } from "../SkillRule";

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
