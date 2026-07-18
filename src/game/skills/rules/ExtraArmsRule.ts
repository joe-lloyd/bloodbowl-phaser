/**
 * Extra Arms (2025 p.128) — "This player applies a +1 modifier to the
 * Agility Test whenever they attempt to Catch, Pick Up or Intercept the
 * ball." (The Intercept clause becomes live when interception is wired.)
 */

import { SkillType } from "../../../types/Skills";
import { SkillRule, PickupContext, CatchContext } from "../SkillRule";
import { Player } from "../../../types/Player";

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
    apply(ctx, self, "pick-up");
  },
  onCatch(ctx, self) {
    apply(ctx, self, "catch");
  },
};
