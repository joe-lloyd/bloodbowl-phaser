/**
 * Hand-off target legality — pure and Phaser-free so the action menu, the
 * board-click handler, the engine operation, and the headless protocol all
 * gate on exactly the same rule.
 *
 * "To perform a Hand-off action, the player that declared the Hand-off must
 * finish their Move Action adjacent to a Standing team-mate who has not lost
 * their Tackle Zone." (2025 rulebook) `hasTackleZone` already excludes
 * Prone, Stunned, and Distracted team-mates, so "Standing AND has not lost
 * its Tackle Zone" collapses to that one predicate.
 */

import { Player, hasTackleZone } from "../../types/Player";

const chebyshev = (
  a: { x: number; y: number },
  b: { x: number; y: number }
): number => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

/** A legal Hand-off target: same team, adjacent, holds its Tackle Zone. */
export function isLegalHandoffTarget(hander: Player, mate: Player): boolean {
  return handoffTargetRefusalReason(hander, mate) === null;
}

/**
 * Why a team-mate is not a legal Hand-off target right now, or null when
 * they are legal. Used to refuse a click/command by reason rather than
 * silently ignoring it.
 */
export function handoffTargetRefusalReason(
  hander: Player,
  mate: Player
): string | null {
  if (mate.id === hander.id) return "cannot hand off to yourself";
  if (mate.teamId !== hander.teamId) return "not a team-mate";
  if (!hander.gridPosition || !mate.gridPosition) return "not adjacent";
  if (chebyshev(hander.gridPosition, mate.gridPosition) !== 1) {
    return "not adjacent";
  }
  if (!hasTackleZone(mate)) {
    return "has lost their Tackle Zone";
  }
  return null;
}

/** Every team-mate that is currently a legal Hand-off target. */
export function legalHandoffTargets(hander: Player, teammates: Player[]): Player[] {
  return teammates.filter((mate) => isLegalHandoffTarget(hander, mate));
}
