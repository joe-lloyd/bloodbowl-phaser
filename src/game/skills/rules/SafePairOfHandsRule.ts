/**
 * Safe Pair of Hands (2025 rulebook p.126) — "If this player would be Knocked
 * Down, Fall Over or be Placed Prone whilst in possession of the ball then,
 * before they become Prone, they may place the ball in any adjacent unoccupied
 * square to the square they will become Prone in instead of Bouncing the ball
 * as normal."
 *
 * Resolved inline where a downed carrier drops the ball (the player's own
 * skill, read off their skills — no participant fold), via BlockManager's
 * dropCarrierBall(). Currently wired into the Block-knockdown drop; the
 * Dodge/Rush fall and Stab paths are a further increment. Inert marker.
 */

import { SkillRule } from "../SkillRule";

export const SafePairOfHandsRule: SkillRule = {};
