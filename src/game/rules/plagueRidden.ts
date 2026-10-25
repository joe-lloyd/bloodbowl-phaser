/**
 * Plague Ridden (2025 rulebook) — a passive trait resolved on the casualty
 * of a Block Action. Sevens has no Casualty Roll, so the Dead result is the
 * injury table's 12 (docs/SEVENS_RULES.md I5).
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
 * The effect is read directly off the killing player (no reacting coach, no
 * dice of its own), so this is an eligibility module plus `confirmKill`
 * rather than a folded SkillRule. A Dead result only becomes a kill once the
 * Apothecary has had its say: CasualtyOperation calls `confirmKill` when no
 * Apothecary is offered, and the Apothecary resolution calls it when the
 * patch-up is declined or fails.
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
import { GameEventNames } from "../../types/events";
import type { IEventBus } from "../../services/EventBus";
import type { IGameService } from "../../services/interfaces/IGameService";

/**
 * How the casualty was inflicted — only a Block Action arms Plague Ridden.
 * "lash-out" is an Animal Savagery team-mate knockdown: not a Block, but
 * the book makes the player use Mighty Blow and Claws on it.
 */
export type CasualtyCause =
  | "block"
  | "special"
  | "dodge"
  | "lethal-flight"
  | "lash-out";

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

/**
 * A Dead result stands: announce the kill and, when the killing Block armed
 * Plague Ridden (see plagueRiddenApplies), spend it to add a Lineman to the
 * killer's Reserves.
 */
export function confirmKill(
  gameService: IGameService,
  eventBus: IEventBus,
  victim: Player,
  killerId: string | undefined,
  armsPlagueRidden: boolean
): void {
  eventBus.emit(GameEventNames.PlayerKilled, {
    causerId: killerId,
    victimId: victim.id,
  });
  const killer = killerId ? gameService.getPlayerById(killerId) : undefined;
  if (!armsPlagueRidden || !killer) return;
  const team = gameService.getTeam(killer.teamId);
  if (!team) return;
  const reinforcement = addReserveLineman(team);
  if (!reinforcement) return;

  killer.plagueRiddenUsed = true;
  eventBus.emit(GameEventNames.SkillTriggered, {
    playerId: killer.id,
    skill: SkillType.PLAGUE_RIDDEN,
    effect: `Plague Ridden: ${victim.playerName}'s death summons ${reinforcement.playerName} to the Reserves`,
  });
  eventBus.emit(
    GameEventNames.UI_Notification,
    `Plague Ridden — ${killer.playerName} adds ${reinforcement.playerName} to the Reserves!`
  );
  eventBus.emit(GameEventNames.RefreshBoard);
}
