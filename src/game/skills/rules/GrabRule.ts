/**
 * Grab (2025 rulebook p.135) — "When this player declares a Block Action, if
 * the opposition player is Pushed Back, then this Player's Coach may choose
 * any unoccupied Square adjacent to the target for them to be Pushed Back
 * into. If there are no adjacent unoccupied squares, then this Skill cannot
 * be used. Additionally, when this player performs a Block Action, opposition
 * players cannot use the Sidestep Skill."
 *
 * `self` is the attacker; sets the flag that widens the push squares (the
 * BlockManager falls back to the normal push when the target is boxed in).
 * The Sidestep-cancel clause lands with Sidestep (batch 6).
 */

import { SkillType } from "../../../types/Skills";
import { SkillRule } from "../SkillRule";

export const GrabRule: SkillRule = {
  onPush(ctx, self) {
    if (self.id !== ctx.attacker.id) return;
    ctx.grabPush = true;
    ctx.triggers.push({
      playerId: self.id,
      skill: SkillType.GRAB,
      effect: "Grab: pushes into any adjacent square",
    });
  },
};
