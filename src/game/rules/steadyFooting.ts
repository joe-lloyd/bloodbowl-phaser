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
import { IGameService } from "../../services/interfaces/IGameService";
import { withRerollOffer } from "../skills/rerolls";

/**
 * Roll Steady Footing for a player about to be Knocked Down / Fall Over.
 * Returns true when they stay standing (trait present and a 6 rolled).
 */
export async function steadyFootingSaves(
  player: Player,
  dice: DiceController,
  eventBus: IEventBus,
  gameService?: IGameService
): Promise<boolean> {
  if (!hasSkill(player.skills, SkillType.STEADY_FOOTING)) return false;

  const roll = () =>
    dice.rollSkillCheck(
      "Steady Footing",
      6,
      0,
      player.playerName,
      player.teamId
    );
  const check = gameService
    ? await withRerollOffer(
        { gameService, eventBus },
        player,
        "steady-footing",
        roll,
        { rollName: "Steady Footing" }
      )
    : roll();
  if (!check.success) return false;

  eventBus.emit(GameEventNames.SkillTriggered, {
    playerId: player.id,
    skill: SkillType.STEADY_FOOTING,
    effect: `${player.playerName} keeps their feet with Steady Footing`,
  });
  return true;
}
