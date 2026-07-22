/**
 * Steady Footing (2025 rulebook p.136)
 *
 *   "Whenever this player would be Knocked Down or Fall Over, roll a D6. On a
 *    6, this player does not get Knocked Down or Fall Over. If this happens
 *    during their activation, they may continue their activation as normal and
 *    no Turnover will be caused."
 *
 * Modelled as a save the falling paths consult before applying the knockdown:
 * a player with the trait rolls a D6 and keeps their feet on a 6. A player
 * without the trait never saves, so callers can gate unconditionally on the
 * return value.
 */

import { Player } from "../../types/Player";
import { SkillType, hasSkill } from "../../types/Skills";
import { DiceController } from "../controllers/DiceController";
import { IEventBus } from "../../services/EventBus";
import { GameEventNames } from "../../types/events";

/**
 * Roll Steady Footing for a player about to be Knocked Down / Fall Over.
 * Returns true when they stay standing (trait present and a 6 rolled).
 */
export function steadyFootingSaves(
  player: Player,
  dice: DiceController,
  eventBus: IEventBus
): boolean {
  if (!hasSkill(player.skills, SkillType.STEADY_FOOTING)) return false;

  const roll = dice.rollD6(
    `Steady Footing (${player.playerName})`,
    player.teamId
  );
  if (roll !== 6) return false;

  eventBus.emit(GameEventNames.SkillTriggered, {
    playerId: player.id,
    skill: SkillType.STEADY_FOOTING,
    effect: `${player.playerName} keeps their feet — Steady Footing (6)`,
  });
  return true;
}
