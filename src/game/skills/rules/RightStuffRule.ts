/**
 * Right Stuff (2025 rulebook, trait) — a player must have this trait and a
 * Strength of 3 or less to be a legal Throw / Kick Team-mate target, and makes
 * the landing roll after being thrown.
 *
 * The eligibility predicate is isRightStuffEligible (src/game/rules/
 * throwTeammate.ts) and the landing roll is resolved in ThrowTeammateOperation.
 * This empty registration marks the trait implemented for the coverage gate.
 */

import { SkillRule } from "../SkillRule";

export const RightStuffRule: SkillRule = {};
