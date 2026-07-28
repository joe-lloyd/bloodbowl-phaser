/**
 * Brawler (2025 rulebook p.127) — "When this player declares a Block Action,
 * they may re-roll a single Both Down result."
 *
 * Unlike a reacting-team skill (Wrestle, Stand Firm), Brawler is not offered
 * as a yes/no prompt before the coach ever sees the dice. It behaves like
 * Team Re-roll / Pro on a block: the normal block-dice popup shows the roll
 * as-is, with a "Brawler: re-roll 1 Both Down" button available whenever a
 * die reads Both Down. Clicking it re-rolls that one die in place and
 * refreshes the popup — see BlockManager.brawlerRerollBlockDie and
 * BlockRollData.brawlerAvailable. This registration only marks the skill
 * implemented for the coverage gate (mirrors Pro/ProRule).
 */

import { SkillRule } from "../SkillRule";

export const BrawlerRule: SkillRule = {};
