/**
 * Always Hungry (2025 rulebook p.123, trait) — "Whenever this player
 * performs a Throw Team-mate Action, before making the Passing Ability
 * Test, they must roll a D6. On a 2+, they may continue with the Throw
 * Team-mate Action as normal. On a 1, the player will attempt to eat their
 * team-mate..."
 *
 * The trait's only clause rides the Throw Team-mate Action, which is a
 * deferred subsystem (batch 9 of the skill campaign) — until it exists the
 * trait has nothing to trigger on, and this registration documents that
 * deliberately: the rule is present, inert by the book outside TTM, and the
 * eat-roll lands with the TTM operation.
 */

import { SkillRule } from "../SkillRule";

export const AlwaysHungryRule: SkillRule = {};
