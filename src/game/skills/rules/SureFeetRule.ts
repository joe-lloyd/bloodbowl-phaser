/**
 * Sure Feet (2025 p.136) — "Once per Turn, this player may re-roll a
 * single D6 when attempting to Rush." Rides the reroll machinery's
 * once-per-turn skill source for the rush roll kind.
 */

import { SkillRule } from "../SkillRule";

export const SureFeetRule: SkillRule = {
  rerollable: ["rush"],
};
