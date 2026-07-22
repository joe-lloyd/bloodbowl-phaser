/**
 * Plague Ridden (2025 rulebook) — a passive trait resolved on the Casualty
 * Roll of a Block Action.
 *
 *   "Once per game, when a player with this Trait causes a Casualty against an
 *    opposition player as a result of a Block Action, and that player suffers
 *    a Dead result on their Casualty Roll and is not saved by an Apothecary,
 *    you may immediately add one new Lineman player from your team's Team
 *    Roster to your Reserves Box."
 *
 *   "This Trait cannot be used against Big Guy players, or any player with the
 *    Decay, Regeneration or Stunty Traits."
 *
 * The effect is read directly off the killing player in CasualtyOperation (no
 * reacting coach, no dice of its own), so this is a pure eligibility module +
 * a reserve-spawning helper rather than a folded SkillRule. An Apothecary
 * save is not modelled in the match engine, so a Dead result is always final.
 */

import {
  Player,
  PlayerStatus,
  PositionKeyWord,
  TraitKeyWord,
  createPlayer,
} from "../../types/Player";
import { Team } from "../../types/Team";
import { SkillType, hasSkill } from "../../types/Skills";
import { getRosterByRosterName } from "../../data/RosterTemplates";

/** How the casualty was inflicted — only a Block Action arms Plague Ridden. */
export type CasualtyCause = "block" | "special" | "dodge";

/**
 * A legal Plague Ridden target: NOT a Big Guy, and without the Decay,
 * Regeneration or Stunty Traits.
 */
export function isPlagueRiddenEligibleTarget(target: Player): boolean {
  if (target.keywords.includes(TraitKeyWord.BIG_GUY)) return false;
  return !(
    hasSkill(target.skills, SkillType.DECAY) ||
    hasSkill(target.skills, SkillType.REGENERATION) ||
    hasSkill(target.skills, SkillType.STUNTY)
  );
}

/**
 * Whether a Dead casualty should let the killer's coach add a Lineman: the
 * killer has the trait and has not spent it, the casualty came from a Block
 * Action against an opposition player, and the victim is an eligible target.
 */
export function plagueRiddenApplies(
  killer: Player,
  victim: Player,
  cause: CasualtyCause | undefined
): boolean {
  return (
    cause === "block" &&
    hasSkill(killer.skills, SkillType.PLAGUE_RIDDEN) &&
    !killer.plagueRiddenUsed &&
    killer.teamId !== victim.teamId &&
    isPlagueRiddenEligibleTarget(victim)
  );
}

/**
 * Add a fresh Lineman from the team's roster to its Reserves Box, returning
 * the new player (or null if the roster has no Lineman). This may push the
 * squad past 16 players, which Plague Ridden explicitly allows.
 */
export function addReserveLineman(team: Team): Player | null {
  const roster = getRosterByRosterName(team.rosterName);
  const template = roster?.playerTemplates.find((t) =>
    t.keywords.includes(PositionKeyWord.LINEMAN)
  );
  if (!template) return null;

  const number =
    team.players.reduce((max, p) => Math.max(max, p.number), 0) + 1;
  const player = createPlayer(template, team.id, number);
  player.status = PlayerStatus.RESERVE;
  team.players.push(player);
  return player;
}
