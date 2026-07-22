/**
 * Plague Ridden (2025 rulebook)
 *
 * Once per game, a Dead casualty inflicted by this player's Block Action on an
 * eligible opposition player lets their coach add a Lineman to the Reserves
 * Box (not against Big Guys or Decay / Regeneration / Stunty players).
 *
 * Like Always Hungry, the clause rides an existing resolution — the Casualty
 * Roll — with no reacting coach or dice of its own, so it is resolved inline
 * in CasualtyOperation via the pure helpers in game/rules/plagueRidden.ts.
 * This empty registration marks the trait implemented for the coverage gate.
 */

import { SkillRule } from "../SkillRule";

export const PlagueRiddenRule: SkillRule = {};
