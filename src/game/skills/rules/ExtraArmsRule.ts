import { SkillType } from "../../../types/Skills";
import { type SkillRule, type PickupContext, type CatchContext } from "../SkillRule";
import { type Player } from "../../../types/Player";

function apply(ctx: PickupContext | CatchContext, self: Player, what: string) {
  if (self.id !== ctx.player.id) return;
  ctx.modifiers += 1;
  ctx.triggers.push({
    playerId: self.id,
    skill: SkillType.EXTRA_ARMS,
    effect: `Extra Arms: +1 to the ${what}`,
  });
}

export const ExtraArmsRule: SkillRule = {
  onPickup(ctx, self) {
    if (ctx.agilityTest) apply(ctx, self, "pick-up");
  },
  onCatch(ctx, self) {
    apply(ctx, self, "catch");
  },
};
