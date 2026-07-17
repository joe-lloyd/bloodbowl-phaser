/**
 * Catch (2025) — the player may re-roll a failed catch, once per turn.
 * The offer/consume flow lives in the reroll machinery.
 */

import { SkillRule } from "../SkillRule";

export const CatchRule: SkillRule = {
  rerollable: ["catch"],
};
