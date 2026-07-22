/**
 * Frenzy (2025 rulebook p.130)
 *
 * Every time this player performs a Block Action, if the target is Pushed
 * Back they must Follow-up (if able); and if the target is still Standing
 * after the push they must throw a second Block Action at the same player,
 * again following up on a push. One extra block only.
 *
 * Like the other block-flow traits (Juggernaut, Fend, Taunt), the behaviour
 * lives in BlockManager — it reads the attacker's Frenzy off their skills at
 * push time (forces the follow-up, queues FrenzyOperation for the second
 * block via `frenzyExtraFor`). This empty registration marks the trait
 * implemented for the coverage gate.
 *
 * Not modelled here: the Blitz clause charging the second block a square of
 * movement (and Rushing when out of movement) — the extra block currently
 * always happens. The draft-list exclusion (no Grab / Hit & Run / Multiple
 * Block on the same player) is a roster-construction constraint, not enforced
 * in a match, and no roster pairs them.
 */

import { SkillRule } from "../SkillRule";

export const FrenzyRule: SkillRule = {};
