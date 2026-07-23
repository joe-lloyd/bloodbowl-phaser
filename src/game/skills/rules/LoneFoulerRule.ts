/**
 * Lone Fouler (2025 rulebook p.133) — "When this player performs a Foul
 * Action, if there are no players providing an Offensive or Defensive Assist,
 * then this player may re-roll a failed Armour Roll."
 *
 * Resolved inline in FoulOperation (the fouler's own skill): when the foul has
 * neither offensive nor defensive assists and the Armour Roll fails, it is
 * re-rolled once. Inert marker.
 */

import { SkillRule } from "../SkillRule";

export const LoneFoulerRule: SkillRule = {};
