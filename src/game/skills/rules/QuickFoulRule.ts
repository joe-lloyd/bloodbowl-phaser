/**
 * Quick Foul (2025 rulebook, Devious skill) — "This player's activation does
 * not end after performing a Foul Action, and they may continue with their Move
 * Action with any movement they have remaining."
 *
 * A Foul Action normally ends the activation (FoulOperation queues a
 * FinishFoulActivationOperation); Quick Foul is read there off the fouler's own
 * skills and simply skips that finish. Nothing to hook here — the registration
 * marks the skill implemented for the coverage gate.
 */

import { SkillRule } from "../SkillRule";

export const QuickFoulRule: SkillRule = {};
