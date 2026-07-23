/**
 * Bullseye (2025 rulebook, Passing skill) — "When this player performs a Throw
 * Team-mate Action, if the result of the throw is a Superb Throw then the
 * thrown player will not Scatter before landing and will instead land in the
 * target square." A Superb Throw is a natural 6 on the Passing Ability Test.
 * (A player without the Throw Team-mate Trait cannot have this Skill.)
 *
 * The behaviour lives inline in ThrowTeammateOperation (it reads the thrower's
 * own skills, like Swoop and Strong Arm), so there is nothing to hook here —
 * the registration marks the skill implemented for the coverage gate.
 */

import { SkillRule } from "../SkillRule";

export const BullseyeRule: SkillRule = {};
