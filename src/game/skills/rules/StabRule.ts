/**
 * Stab (2025 p.136, trait) - "When this player performs a Stab Special
 * Action, select a Standing opposition player adjacent to this player and
 * make an Armour Roll for the selected player. This Armour Roll cannot be
 * modified in any way. If the player's armour is broken, make an Injury
 * Roll for them, otherwise nothing happens." Any number of players may
 * declare it per Turn; it may replace the Block of a Blitz; the activation
 * ends as soon as the Stab is performed. Never a turnover.
 *
 * The behaviour lives in StabOperation and the action gate in
 * GameService.declareAction/stabPlayer - the unmodifiable Armour Roll is
 * rolled outside the skill fold, so there is nothing to hook here. The
 * registration marks the trait implemented for the coverage gate.
 */

import { SkillRule } from "../SkillRule";

export const StabRule: SkillRule = {};
