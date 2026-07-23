/**
 * Dirty Player (2025 rulebook p.132) — "When this player performs a Foul
 * Action, they may apply a +1 modifier to either the Armour Roll or Injury
 * Roll. This modifier may be applied after the roll has been made."
 *
 * Resolved inline in FoulOperation (the fouler's own skill, read off their
 * skills — no participant fold): the +1 is applied to the Armour Roll when it
 * would break the armour, otherwise held for the Injury Roll. Inert marker.
 */

import { SkillRule } from "../SkillRule";

export const DirtyPlayerRule: SkillRule = {};
