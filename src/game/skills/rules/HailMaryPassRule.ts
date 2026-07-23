/**
 * Hail Mary Pass (2025 rulebook p.124)
 *
 * "When this player performs a Pass Action or a Throw Bomb Special Action,
 * they may declare any square on the pitch as the target square rather than
 * using the Range Ruler. Make a Passing Ability Test as normal treating the
 * throw as a Long Bomb, and treating any result of an Accurate Pass as an
 * Inaccurate Pass. A Hail Mary Pass cannot be Intercepted."
 *
 * Modelled on the passer's onPassDeclared fold: the throw cannot be
 * Intercepted (suppressInterception) and any Accurate result is downgraded to
 * Inaccurate (downgradeAccurate → the ball scatters from the target square).
 *
 * The engine already treats an out-of-range target as a Long Bomb for the PA
 * test, so a long Hail Mary is a Long Bomb by construction; forcing the -3
 * Long-Bomb modifier for a SHORT Hail Mary is not modelled (a short Hail Mary
 * is never advantageous, so this is a benign gap). The Throw Bomb clause lands
 * with the Bombardier subsystem.
 */

import { SkillType } from "../../../types/Skills";
import { SkillRule, PassDeclaredContext } from "../SkillRule";
import { Player } from "../../../types/Player";

export const HailMaryPassRule: SkillRule = {
  onPassDeclared(ctx: PassDeclaredContext, self: Player): void {
    // Only the passer's own Hail Mary Pass applies.
    if (self.id !== ctx.player.id) return;
    ctx.suppressInterception = true;
    ctx.downgradeAccurate = true;
    ctx.triggers.push({
      playerId: self.id,
      skill: SkillType.HAIL_MARY_PASS,
      effect: "Hail Mary Pass: Accurate → Inaccurate, cannot be Intercepted",
    });
  },
};
