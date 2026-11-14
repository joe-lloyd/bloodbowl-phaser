/**
 * Eye Gouge (2025 rulebook p.132) — "When an opposition player is Pushed Back
 * by this player, the opposition player cannot provide Offensive or Defensive
 * Assists until after they are next activated."
 *
 * `self` is the blocker doing the pushing: flag the push, and BlockManager
 * gives the Block's target the Eye Gouged condition once the push is
 * applied. Stand Firm refusing the push prevents it, and chain-pushed
 * players never gain it (May 2026 FAQ). AssistValidator then ignores an Eye
 * Gouged assister, and the engine clears the condition when that player is
 * next activated (TurnManager), exactly like Distracted.
 */

import { SkillRule } from "../SkillRule";

export const EyeGougeRule: SkillRule = {
  onPush(ctx, self) {
    if (self.id !== ctx.attacker.id) return;
    ctx.eyeGouge = true;
  },
};
