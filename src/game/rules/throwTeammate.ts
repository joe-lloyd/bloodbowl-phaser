/**
 * Throw / Kick Team-mate eligibility — pure and Phaser-free so the action
 * menu, the engine operation, and the headless protocol all gate on exactly
 * the same rule.
 *
 * A team-mate is a legal Throw or Kick Team-mate target only if they have the
 * Right Stuff trait AND a Strength characteristic of 3 or less (2025 rulebook,
 * Right Stuff). Being Standing / adjacent is checked by the callers against
 * live board state; this predicate is purely about the target's profile.
 */

import { Player } from "../../types/Player";
import { SkillType, hasSkill } from "../../types/Skills";
import { PassController } from "../controllers/PassController";

/** Right Stuff trait present and Strength 3 or less. */
export function isRightStuffEligible(player: Player): boolean {
  return hasSkill(player.skills, SkillType.RIGHT_STUFF) && player.stats.ST <= 3;
}

/**
 * A team-mate may only be thrown at Quick or Short range — a thrown player is
 * much heavier than the ball, so the Long Pass and Long Bomb bands (and
 * anything off the range ruler) are out of range for Throw / Kick Team-mate.
 * `rangeValue` is 0 for Quick, 1 for Short, 2/3 for Long/Long Bomb, null out.
 */
export function isThrowTeammateInRange(
  from: { x: number; y: number },
  to: { x: number; y: number }
): boolean {
  const value = PassController.rangeValue(from, to);
  return value === 0 || value === 1;
}
