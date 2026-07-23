/**
 * Very Long Legs (2025 rulebook p.127) — "This player may apply a +1 modifier
 * to the Agility Test whenever they attempt to Leap or Jump, and may apply a +2
 * modifier to the Agility Test whenever they attempt to Intercept the ball.
 * Additionally, this player ignores the Cloud Burster Skill."
 *
 * The Jump/Leap +1 is applied here via onJumpDeclared. The +2 interception
 * bonus and the Cloud-Burster-ignore clause are resolved inline in
 * PassOperation.resolveInterception (read off the interceptor's own skills —
 * no fold): a Very Long Legs interceptor gets +2 to the roll and is still
 * offered the interception when the passer has Cloud Burster.
 */

import { SkillType } from "../../../types/Skills";
import { SkillRule, JumpDeclaredContext } from "../SkillRule";
import { Player } from "../../../types/Player";

export const VeryLongLegsRule: SkillRule = {
  onJumpDeclared(ctx: JumpDeclaredContext, self: Player): void {
    if (self.id !== ctx.player.id) return;
    ctx.bonusModifier += 1;
    ctx.triggers.push({
      playerId: self.id,
      skill: SkillType.VERY_LONG_LEGS,
      effect: "Very Long Legs: +1 to the Jump Agility Test",
    });
  },
};
