import { type Player } from "../../types/Player";
import { SkillType, hasSkill } from "../../types/Skills";
import { DiceController } from "../controllers/DiceController";
import { type IEventBus } from "../../services/EventBus";
import { GameEventNames } from "../../types/events";
import { type IGameService } from "../../services/interfaces/IGameService";
import { withRerollOffer } from "../skills/rerolls";

export async function steadyFootingSaves(
  player: Player,
  dice: DiceController,
  eventBus: IEventBus,
  gameService?: IGameService
): Promise<boolean> {
  if (!hasSkill(player.skills, SkillType.STEADY_FOOTING)) return false;

  const roll = () =>
    dice.rollSkillCheck(
      { reason: "Steady Footing",target: 6,modifier: 0,playerName: player.playerName,teamId: player.teamId }    );
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
