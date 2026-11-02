/**
 * Steady Footing (2025 rulebook p.136)
 *
 * Whenever this player would be Knocked Down or Fall Over, roll a D6 — on a 6
 * they stay up (no knockdown, no Turnover, and they continue their activation).
 *
 * Resolved after other skills decide whether the player would actually
 * fall, via steadyFootingSaves() in game/rules/steadyFooting.ts. Movement
 * falls and block knockdowns share that save and its re-roll offer. Wrestle
 * places players Prone, so it never triggers the save.
 */

import { SkillRule } from "../SkillRule";

export const SteadyFootingRule: SkillRule = {};
