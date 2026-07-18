/**
 * Sprint (2025 p.136) — "When this player performs a Move Action they may
 * attempt to Rush one additional time than they would normally be
 * allowed to." The effect lives in the shared movement allowance helper
 * (src/game/skills/movement.ts: rushAllowance), which every movement site
 * consults; registering the rule marks the skill implemented.
 */

import { SkillRule } from "../SkillRule";

export const SprintRule: SkillRule = {};
