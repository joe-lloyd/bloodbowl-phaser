/**
 * Safe Pass (2025 p.135) — "If this player rolls a natural 1 when making
 * a Passing Ability Test, then it will not result in a Fumbled Pass.
 * Instead, the player retains possession of the ball and their activation
 * immediately ends. No Turnover is caused."
 */

import { SkillType } from "../../../types/Skills";
import { SkillRule } from "../SkillRule";

export const SafePassRule: SkillRule = {
  onPassResult(ctx, self) {
    if (self.id !== ctx.player.id) return;
    if (!ctx.fumbled || ctx.roll !== 1) return;
    ctx.keepBall = true;
    ctx.triggers.push({
      playerId: self.id,
      skill: SkillType.SAFE_PASS,
      effect: "Safe Pass: fumble cancelled, ball held, activation ends",
    });
  },
};
