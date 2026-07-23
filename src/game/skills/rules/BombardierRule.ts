/**
 * Bombardier (2025 rulebook, trait) — "When this player is activated, they can
 * declare a Throw Bomb Special Action... they throw a bomb in the same manner
 * as when a player performs a Pass Action." The bomb explodes when it comes to
 * rest, hitting the square it lands in and each adjacent player on a 4+.
 *
 * The behaviour lives in BombardierOperation and the action gate in
 * GameService.declareAction/throwBomb — the Throw Bomb is resolved outside the
 * skill fold, so there is nothing to hook here. The registration marks the
 * trait implemented for the coverage gate.
 */

import { SkillRule } from "../SkillRule";

export const BombardierRule: SkillRule = {};
