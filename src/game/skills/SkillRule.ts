/**
 * SkillRule - a self-contained rule for one skill.
 *
 * Each rule exposes optional, narrowly-typed hooks that the roll paths fold
 * over at rule-relevant moments. A rule mutates the context it is given; it
 * never controls flow directly (per the architecture rules). A skill with no
 * registered rule is inert — play is identical to a player without it.
 *
 * Hooks are added as skills need them. The block-result hook is the first;
 * dodge/pickup/catch/pass/reroll/reaction hooks follow the same shape.
 */

import { Player } from "../../types/Player";
import { BlockResultType } from "../../services/BlockResolutionService";

/** Outcome of a block result, mutated by rules before it is applied. */
export interface BlockResultContext {
  attacker: Player;
  defender: Player;
  resultType: BlockResultType;
  /** Will the attacker be knocked down? (rules may flip to false) */
  attackerKnockedDown: boolean;
  /** Will the defender be knocked down? */
  defenderKnockedDown: boolean;
  /** Skill effects to announce (playerId + skill + effect) */
  triggers: { playerId: string; skill: string; effect: string }[];
}

export interface SkillRule {
  /**
   * Fired while a block result is being resolved. `self` is the player who
   * holds this skill (attacker or defender); the rule reads the context and
   * may adjust the knock-down flags (e.g. Block ignores Both Down).
   */
  onBlockResult?(ctx: BlockResultContext, self: Player): void;
}
