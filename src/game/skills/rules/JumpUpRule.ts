/**
 * Jump Up (2025 p.130), both clauses — neither needs a hook here:
 *
 * 1. "A Prone player with this Skill can stand up for free without having to
 *    spend 3 squares of movement to do so." The cost lives in the shared
 *    helper (src/game/skills/movement.ts: standUpCost).
 * 2. Declaring a Block Action whilst Prone, on a passed Agility Test with a
 *    +1 modifier. Declaration is permitted by GameService.declareAction and
 *    the test is rolled by MovementManager.standUp, which reads the declared
 *    action — so the browser, the headless protocol and online all inherit it
 *    from one seam. A failed test wastes the Action but is not a Turnover.
 */

import { SkillRule } from "../SkillRule";

export const JumpUpRule: SkillRule = {};
