/**
 * Eye Gouge (2025 rulebook p.132) — "When an opposition player is Pushed Back
 * by this player, the opposition player cannot provide Offensive or Defensive
 * Assists until after they are next activated."
 *
 * `self` is the blocker doing the pushing: mark the pushed player with the
 * Eye Gouged condition. AssistValidator then ignores an Eye Gouged assister,
 * and the engine clears the condition when that player is next activated
 * (TurnManager), exactly like Distracted.
 */

import { SkillType } from "../../../types/Skills";
import { PlayerCondition, addCondition } from "../../../types/Player";
import { SkillRule } from "../SkillRule";

export const EyeGougeRule: SkillRule = {
  onPush(ctx, self) {
    if (self.id !== ctx.attacker.id) return;
    addCondition(ctx.pushed, PlayerCondition.EYE_GOUGED);
    ctx.triggers.push({
      playerId: self.id,
      skill: SkillType.EYE_GOUGE,
      effect: `Eye Gouge: ${ctx.pushed.playerName} cannot assist until next activated`,
    });
  },
};
