/**
 * Steady Footing (2025 rulebook p.136)
 *
 * Whenever this player would be Knocked Down or Fall Over, roll a D6 — on a 6
 * they stay up (no knockdown, no Turnover, and they continue their activation).
 *
 * Resolved inline where a player falls, via steadyFootingSaves() in
 * game/rules/steadyFooting.ts (read off the player's own skills, no fold), so
 * this is an inert marker like Stab / Frenzy. Currently wired into the "Fall
 * Over" paths — a failed Dodge and a failed Rush (GFI) in MovementManager.
 * The "Knocked Down" case from a Block Action is a further increment (it would
 * hook BlockManager.knockDownPlayer and suppress the armour/turnover for a
 * saved player).
 */

import { SkillRule } from "../SkillRule";

export const SteadyFootingRule: SkillRule = {};
