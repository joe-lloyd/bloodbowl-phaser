/**
 * Breathe Fire (2025 rulebook p.126, trait) — a Special Action against "one
 * Standing opposition player they are Marking": roll a D6 with -1 if the
 * target's ST is 5+. Natural 1: the breather is Knocked Down. 2-3: nothing.
 * 4+: the target is Placed Prone. Natural 6: the target is Knocked Down
 * instead. May replace the Block of a Blitz. The activation ends once
 * resolved.
 *
 * The behaviour lives in BreatheFireOperation (declared action
 * "breatheFire", Stab pattern). This registration marks the trait
 * implemented for the coverage gate.
 */

import { SkillRule } from "../SkillRule";

export const BreatheFireRule: SkillRule = {};
