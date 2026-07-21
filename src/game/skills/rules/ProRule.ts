/**
 * Pro (2025 rulebook p.133, General skill) — "During this player's
 * activation, they may attempt to re-roll a single dice... To use this
 * Skill, the player must roll a D6: on a 3+ the dice may be re-rolled...
 * The Skill cannot be used to re-roll a dice made as part of an Armour
 * Roll, Injury Roll, Casualty Roll, a roll made outside of the player's
 * activation... Once a player has attempted to use this Skill, they cannot
 * use a re-roll from any other source to re-roll the dice."
 *
 * The behaviour lives in the reroll machinery (rerolls.ts offers the "pro"
 * source on every eligible roll kind — all single-die rolls made during the
 * player's own activation; Armour/Injury/Casualty never pass through that
 * seam). Block-dice pools have no reroll seam yet; Pro extends to them when
 * one exists. This registration marks the skill implemented for the gate.
 */

import { SkillRule } from "../SkillRule";

export const ProRule: SkillRule = {};
