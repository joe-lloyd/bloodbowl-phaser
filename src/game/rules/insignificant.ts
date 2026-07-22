/**
 * Insignificant (2025 rulebook, p.129) — a draft-list-only trait.
 *
 *   "When creating a Team Draft List, you may not include more players with
 *    this Trait than players without this Trait."
 *
 * It has NO in-match effect, so — unlike every other trait — it is not a
 * gameplay SkillRule and is deliberately left out of the SkillRegistry (see
 * the coverage-gate allowlist). It still gets a rule file so every trait is
 * tracked the same way; the enforcement is a whole-list check the team
 * builder runs when a draft list is finalised, not a per-player gate (the
 * limit is about the finished list, so it must not depend on hire order).
 */

import { Player } from "../../types/Player";
import { SkillType, hasSkill } from "../../types/Skills";

/** Does this player carry the Insignificant trait? */
export function isInsignificant(player: Player): boolean {
  return hasSkill(player.skills, SkillType.INSIGNIFICANT);
}

/** How many players in the list have Insignificant. */
export function countInsignificant(players: Player[]): number {
  return players.filter(isInsignificant).length;
}

/**
 * True when the draft list satisfies the Insignificant limit: the players
 * with the trait must not outnumber the players without it.
 */
export function insignificantLimitOk(players: Player[]): boolean {
  const insignificant = countInsignificant(players);
  const significant = players.length - insignificant;
  return insignificant <= significant;
}

/**
 * A human-readable violation message for an illegal draft list, or null when
 * the list is legal — the team builder surfaces this when saving.
 */
export function validateInsignificant(players: Player[]): string | null {
  if (insignificantLimitOk(players)) return null;
  const insignificant = countInsignificant(players);
  const significant = players.length - insignificant;
  return (
    `Too many Insignificant players: ${insignificant} with the trait vs ` +
    `${significant} without. A Team Draft List may not include more ` +
    `Insignificant players than players without the trait.`
  );
}
