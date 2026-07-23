/**
 * Give and Go (2025 rulebook, Passing skill) — "If this player performs a Pass
 * Action that is a Quick Pass, or performs a Hand-off Action, then, so long as
 * a Turnover isn't caused, their activation does not end once the Pass or
 * Hand-off is resolved. Instead, they may continue with their Move Action using
 * any movement they have remaining."
 *
 * A Pass / Hand-off normally ends the activation (PassOperation queues a
 * FinishPassActivationOperation); Give and Go is read there off the passer's
 * own skills and skips that finish after a Quick Pass or a Hand-off (the finish
 * op is a no-op anyway if a Turnover flipped the turn). Nothing to hook here —
 * the registration marks the skill implemented for the coverage gate.
 */

import { SkillRule } from "../SkillRule";

export const GiveAndGoRule: SkillRule = {};
