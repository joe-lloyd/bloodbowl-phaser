/**
 * Cloud Burster (2025 rulebook p.121)
 *
 * "When this player performs a Pass Action, opposition players may not attempt
 * to Intercept the ball." A passer-side rule: when THIS player is the one
 * throwing, it raises the `cloudBurster` flag on the pass context, and
 * PassOperation suppresses the interception offer for every opponent EXCEPT a
 * Very Long Legs interceptor, who ignores Cloud Burster.
 */

import { SkillType } from "../../../types/Skills";
import { SkillRule, PassDeclaredContext } from "../SkillRule";
import { Player } from "../../../types/Player";

export const CloudBursterRule: SkillRule = {
  onPassDeclared(ctx: PassDeclaredContext, self: Player): void {
    // Only the passer's own Cloud Burster suppresses interception.
    if (self.id !== ctx.player.id) return;
    ctx.cloudBurster = true;
    ctx.triggers.push({
      playerId: self.id,
      skill: SkillType.CLOUD_BURSTER,
      effect: "Cloud Burster: only Very Long Legs may Intercept",
    });
  },
};
