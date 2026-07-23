/**
 * Sneaky Git (2025 rulebook p.134) — "This player is not Sent-off when
 * performing a Foul Action if a natural double is rolled for the Armour Roll,
 * so long as the target player's Armour is not broken. If the target player's
 * Armour is broken, this player will still be sent off as normal."
 *
 * Resolved inline in FoulOperation (the fouler's own skill): a natural-double
 * Armour Roll that does not break the armour is not spotted. Inert marker.
 */

import { SkillRule } from "../SkillRule";

export const SneakyGitRule: SkillRule = {};
