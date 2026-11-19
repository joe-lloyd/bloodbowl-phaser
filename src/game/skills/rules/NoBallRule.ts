import { SkillType } from "../../../types/Skills";
import { type SkillRule, type PickupContext, type CatchContext } from "../SkillRule";
import { type Player } from "../../../types/Player";

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
