/**
 * Kick (2025 p.130, skill) — "If this player is nominated as the kicking
 * player, then when the kick Deviates this player's Coach may choose for it
 * to only Deviate D3 squares rather than the usual D6."
 *
 * The behaviour lives in the kickoff flow (BallManager.kickBall →
 * KickoffController → BallMovementController.deviate): when the nominated
 * kicker has this skill the deviation distance is a D3 instead of a D6. The
 * reduced deviation is always the safer choice for the kicking coach, so it
 * is applied automatically. This registration marks the skill implemented
 * for the coverage gate.
 */

import { SkillRule } from "../SkillRule";

export const KickRule: SkillRule = {};
