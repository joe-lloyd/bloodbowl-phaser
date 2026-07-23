/**
 * Pogo (2025 rulebook p.133) — "During their movement, a player with this
 * Trait can attempt to Pogo over a single adjacent square regardless of what
 * is in the square. Pogoing works the same way as Jumping … with the exception
 * that the Pogoing player may ignore all negative modifiers they would receive
 * by Jumping."
 *
 * The "regardless of what is in the square" clause is enforced in
 * MovementManager.jumpPlayer; this rule zeroes the marking penalty. (A player
 * with Pogo cannot also have Leap — a roster constraint, not enforced here.)
 */

import { SkillType } from "../../../types/Skills";
import { SkillRule, JumpDeclaredContext } from "../SkillRule";
import { Player } from "../../../types/Player";

export const PogoRule: SkillRule = {
  onJumpDeclared(ctx: JumpDeclaredContext, self: Player): void {
    if (self.id !== ctx.player.id) return;
    if (ctx.negativeModifier >= 0) return;
    ctx.negativeModifier = 0;
    ctx.triggers.push({
      playerId: self.id,
      skill: SkillType.POGO,
      effect: "Pogo: ignores all negative Jump modifiers",
    });
  },
};
