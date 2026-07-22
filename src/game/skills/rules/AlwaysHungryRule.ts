/**
 * Whenever this player performs a Throw Team-
 * mate Action, before making the Passing Ability
 * Test, they must roll a D6. On a 2+, they may
 * continue with the Throw Team-mate Action as
 * normal. On a 1, the player will attempt to eat
 * their team-mate - they must roll a further D6.
 * On a 2+, the team-mate will squirm free and 
 * the Throw Team-mate Action will automatically
 * result in a Fumbled Throw. On a 1, the player
 * will eat their team-mate - immediately
 * remove them from your Team Draft List. No
 * Apothecary can be usedtotry to save them,
 * and no Regeneration rolls can be made. If the
 * team-mate was in possession of the ball, it will 
 * Bounce from the square this player occupies. A 
 * Turnover is then caused.
 * 
 * The trait's only clause rides the Throw Team-mate Action. The eat roll is
 * resolved inline in ThrowTeammateOperation (read off the thrower's skills,
 * like BallManager reads Kick) rather than via a trigger fold, so there is
 * nothing to hook here. This empty registration marks the trait implemented
 * for the coverage gate.
 */

import { SkillRule } from "../SkillRule";

export const AlwaysHungryRule: SkillRule = {};
