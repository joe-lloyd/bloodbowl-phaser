/**
 * Kick Team-mate (2025 rulebook, trait) — resolves using the Throw Team-mate
 * rules, but a Fumble removes the kicked player from play and forces an
 * immediate Injury Roll. Strong Arm never helps a kick.
 *
 * The behaviour lives in ThrowTeammateOperation (mode "kick") and the action
 * gate in GameService. This empty registration marks the trait implemented for
 * the coverage gate.
 */

import { SkillRule } from "../SkillRule";

export const KickTeamMateRule: SkillRule = {};
