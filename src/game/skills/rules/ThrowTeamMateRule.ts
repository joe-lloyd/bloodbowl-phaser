/**
 * Throw Team-mate (2025 rulebook, trait) — a Standing player may throw an
 * eligible team-mate (Right Stuff, ST 3 or less) like the ball.
 *
 * The behaviour lives in ThrowTeammateOperation and the action gate in
 * GameService.declareAction/throwTeammate (and actionAvailability for the
 * contextual menu). Nothing folds over a trigger here, so the rule is an empty
 * registration that marks the trait implemented for the coverage gate.
 */

import { SkillRule } from "../SkillRule";

export const ThrowTeamMateRule: SkillRule = {};
