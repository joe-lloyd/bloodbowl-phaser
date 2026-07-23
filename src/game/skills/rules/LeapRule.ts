/**
 * Leap (2025 rulebook p.124) — "During their Move Action, a player with this
 * Skill can attempt to Leap over a single adjacent square regardless of what
 * is in the square. Leaping works the same way as Jumping … with the exception
 * that the Leaping player may reduce the negative modifiers they would receive
 * by Leaping by 1, to a minimum of -1."
 *
 * The "regardless of what is in the square" clause (jump over standing players
 * / empty squares) is enforced in MovementManager.jumpPlayer; this rule softens
 * the marking penalty by 1, never past -1.
 */

import { SkillType } from "../../../types/Skills";
import { SkillRule, JumpDeclaredContext } from "../SkillRule";
import { Player } from "../../../types/Player";

export const LeapRule: SkillRule = {
  onJumpDeclared(ctx: JumpDeclaredContext, self: Player): void {
    if (self.id !== ctx.player.id) return;
    if (ctx.negativeModifier >= 0) return; // nothing to soften
    const softened = Math.min(ctx.negativeModifier + 1, -1);
    if (softened === ctx.negativeModifier) return; // already at -1
    ctx.negativeModifier = softened;
    ctx.triggers.push({
      playerId: self.id,
      skill: SkillType.LEAP,
      effect: "Leap: negative Jump modifier reduced by 1 (min -1)",
    });
  },
};
