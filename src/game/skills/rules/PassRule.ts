/**
 * Pass (2025) — the player may re-roll a failed pass (inaccurate or
 * fumbled), once per turn. The offer/consume flow lives in the reroll
 * machinery; the offer fires before scatter/fumble resolution.
 */

import { SkillRule } from "../SkillRule";

export const PassRule: SkillRule = {
  rerollable: ["pass"],
};
