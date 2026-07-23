/**
 * Ball & Chain (2025 rulebook, trait) — "When this player is activated, the
 * only action they can declare is a Ball & Chain Special Action." The player
 * lurches with the Throw-in Template, auto-passing dodges, blocking whoever it
 * bumps into, and hurting itself easily.
 *
 * The behaviour lives in BallAndChainOperation and the action gate in
 * GameService.declareAction/ballAndChain (a Standing Fanatic may declare
 * nothing else). Resolved outside the skill fold, so there is nothing to hook
 * here — the registration marks the trait implemented for the coverage gate.
 */

import { SkillRule } from "../SkillRule";

export const BallAndChainRule: SkillRule = {};
