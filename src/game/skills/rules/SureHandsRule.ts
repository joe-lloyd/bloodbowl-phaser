/**
 * Sure Hands (2025) — the player may re-roll a failed pick-up, once per
 * turn. The offer/consume flow lives in the reroll machinery.
 */

import { SkillRule } from "../SkillRule";

export const SureHandsRule: SkillRule = {
  rerollable: ["pickup"],
};
