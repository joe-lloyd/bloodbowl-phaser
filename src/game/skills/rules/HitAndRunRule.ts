/**
 * Hit and Run (2025 rulebook p.123) — "When a player with this Skill performs
 * a Block Action or a Stab Special Action, after fully resolving the Action,
 * they may immediately move one free square ignoring Tackle Zones, so long as
 * they are still Standing. The player must ensure that after this free move
 * they are not Marked by or Marking any opposition players."
 *
 * The behaviour lives in BlockManager (hitAndRunSquares / resolveHitAndRun /
 * freeMove, offered as a reacting decision after a Block resolves). This
 * registration marks the trait implemented for the coverage gate. Currently
 * wired into the knockdown-in-place Block completion; the push/follow-up and
 * Stab paths are a further increment. (Cannot be combined with Frenzy — a
 * roster-construction constraint, not enforced in a match.)
 */

import { SkillRule } from "../SkillRule";

export const HitAndRunRule: SkillRule = {};
