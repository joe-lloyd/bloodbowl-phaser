/**
 * Hail Mary Pass (2025 rulebook p.124)
 *
 * "When this player performs a Pass Action or a Throw Bomb Special Action,
 * they may declare any square on the pitch as the target square rather than
 * using the Range Ruler. Make a Passing Ability Test as normal treating the
 * throw as a Long Bomb, and treating any result of an Accurate Pass as an
 * Inaccurate Pass. A Hail Mary Pass cannot be Intercepted."
 *
 * The coach opts in per throw (the `hailMary` flag on the pass command).
 * PassController throws a declared Hail Mary as a Long Bomb and downgrades an
 * Accurate result; this rule stops the throw being Intercepted. The Throw
 * Bomb clause lands with the Bombardier subsystem.
 */

import { SkillType } from "../../../types/Skills";
import { SkillRule, PassDeclaredContext } from "../SkillRule";
import { Player } from "../../../types/Player";

export const HailMaryPassRule: SkillRule = {
  onPassDeclared(ctx: PassDeclaredContext, self: Player): void {
    // Only the passer's own Hail Mary Pass applies.
    if (self.id !== ctx.player.id || !ctx.hailMary) return;
    ctx.suppressInterception = true;
    ctx.triggers.push({
      playerId: self.id,
      skill: SkillType.HAIL_MARY_PASS,
      effect: "Hail Mary Pass: Accurate → Inaccurate, cannot be Intercepted",
    });
  },
};
