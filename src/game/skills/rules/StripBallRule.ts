/**
 * Strip Ball (2025 rulebook p.138) — "When this player performs a Block
 * Action against an opposition player holding the ball, if the opposition
 * player is Pushed Back then they will drop the ball in the square they are
 * Pushed Back into, at which point it will Bounce from that square. This
 * Bounce will happen before the opposition player becomes Prone (if
 * applicable) but after this player chooses to Follow-up."
 *
 * `self` is the attacker; sets the flag that makes the pushed ball-carrier
 * drop the ball where they land.
 */

import { SkillType } from "../../../types/Skills";
import { SkillRule } from "../SkillRule";

export const StripBallRule: SkillRule = {
  onPush(ctx, self) {
    if (self.id !== ctx.attacker.id || !ctx.pushedHasBall) return;
    ctx.stripBall = true;
    ctx.triggers.push({
      playerId: self.id,
      skill: SkillType.STRIP_BALL,
      effect: "Strip Ball: the carrier drops the ball where pushed",
    });
  },
};
