/**
 * Hypnotic Gaze (2025 rulebook p.129, trait) — a Special Action: the player
 * may first move (the Blitz movement pattern), then "select a Standing
 * opposition player adjacent to them and roll a D6. On a 1-2, nothing
 * happens and this player's activation immediately ends. On a 3+, the
 * selected opposition player becomes Distracted and this player's
 * activation immediately ends."
 *
 * The behaviour lives in HypnoticGazeOperation and the action gate in
 * GameService (declared action "gaze", movement allowed before the gaze,
 * activation ends with it). This registration marks the trait implemented
 * for the coverage gate.
 */

import { SkillRule } from "../SkillRule";

export const HypnoticGazeRule: SkillRule = {};
