/**
 * Strong Arm (2025 rulebook, Strength skill) — applies a +1 modifier to a
 * Throw Team-mate Passing Ability Test. It explicitly does NOT apply to a Kick
 * Team-mate Action.
 *
 * The modifier is applied in ThrowTeammateOperation (mode "throw" only). This
 * empty registration marks the skill implemented for the coverage gate.
 */

import { SkillRule } from "../SkillRule";

export const StrongArmRule: SkillRule = {};
