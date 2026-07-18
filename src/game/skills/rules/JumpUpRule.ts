/**
 * Jump Up (2025 p.130) — "A Prone player with this Skill can stand up for
 * free without having to spend 3 squares of movement to do so." The cost
 * lives in the shared helper (src/game/skills/movement.ts: standUpCost).
 *
 * NOT YET IMPLEMENTED: the second clause (declare a Block Action whilst
 * Prone on a passed Agility Test +1) needs prone-block action declaration
 * and is deferred to the action-system batch.
 */

import { SkillRule } from "../SkillRule";

export const JumpUpRule: SkillRule = {};
