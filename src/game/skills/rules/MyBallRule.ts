/**
 * My Ball (2025 rulebook p.132, trait) — "A player with this Trait may not
 * willingly give up the ball when in possession of it, and so may not
 * declare Pass Actions, Hand-off Actions, or use any other Skill or Trait
 * that would allow them to relinquish possession of the ball. The only way
 * they can lose possession is by being Knocked Down, Placed Prone, Falling
 * Over or by the effect of a Skill, Trait, or special rule of an opposing
 * model."
 *
 * Declaration gate on the existing synchronous onActionDeclared fold (the
 * Unsteady pattern). Relinquish-style skills (Fumblerooski, Punt, …) are
 * not implemented yet; they must consult this gate when they land.
 */

import { SkillType } from "../../../types/Skills";
import { SkillRule } from "../SkillRule";

export const MyBallRule: SkillRule = {
  onActionDeclared(ctx, self) {
    if (!ctx.hasBall) return;
    if (
      ctx.action !== "pass" &&
      ctx.action !== "handoff" &&
      ctx.action !== "throwTeamMate"
    ) {
      return;
    }
    ctx.refused = true;
    ctx.triggers.push({
      playerId: self.id,
      skill: SkillType.MY_BALL,
      effect: "My Ball: will not willingly give up the ball",
    });
  },
};
