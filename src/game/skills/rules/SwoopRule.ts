/**
 * Swoop (2025 rulebook, trait) — a thrown player scatters using the tighter
 * throw-in template instead of the standard Scatter template, and gets +1 to
 * the Right Stuff landing roll.
 *
 * Both effects are read off the thrower's skills inside ThrowTeammateOperation
 * (like BallManager reads Kick), so nothing folds over a trigger here. This
 * empty registration marks the trait implemented for the coverage gate.
 */

import { SkillRule } from "../SkillRule";

export const SwoopRule: SkillRule = {};
