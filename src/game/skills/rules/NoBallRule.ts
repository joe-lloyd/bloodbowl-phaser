/**
 * No Ball (2025 p.132, compulsory trait) — "A player with this Trait may
 * never have possession of the ball. If this player would be required to
 * attempt to Catch or Pick-up the Ball they will automatically fail to do
 * so as if they had rolled a natural 1." (The Intercept ban becomes live
 * when interception is wired.)
 */

import { SkillType } from "../../../types/Skills";
import { SkillRule, PickupContext, CatchContext } from "../SkillRule";
import { Player } from "../../../types/Player";

function fail(ctx: PickupContext | CatchContext, self: Player, what: string) {
  if (self.id !== ctx.player.id) return;
  ctx.autoFail = true;
  ctx.triggers.push({
    playerId: self.id,
    skill: SkillType.NO_BALL,
    effect: `No Ball: automatically fails the ${what}`,
  });
}

export const NoBallRule: SkillRule = {
  onPickup(ctx, self) {
    fail(ctx, self, "pick-up");
  },
  onCatch(ctx, self) {
    fail(ctx, self, "catch");
  },
};
