import { activeRules } from "@/game/variants/activeMatch";
import { steadyFootingSaves } from "@/game/rules/steadyFooting";
import { withRerollOffer } from "@/game/skills";
import { rushRollModifier } from "@/game/rules/rollPreview";
import type { Player } from "@/types/Player";
import { SkillType, hasSkill } from "@/types/Skills";
import { GameEventNames } from "@/types/events";
import type { GameParts } from "./parts";

interface RushRequest {
  teamId?: string;
}

export async function rushSucceeds(
  parts: GameParts,
  attacker: Player,
  request: RushRequest = {}
): Promise<boolean> {
  if (hasSkill(attacker.skills, SkillType.DRUNKARD))
    parts.eventBus.emit(GameEventNames.SkillTriggered, {
      playerId: attacker.id,
      skill: SkillType.DRUNKARD,
      effect: "Drunkard: -1 to the Rush",
    });
  const check = await withRerollOffer(
    { gameService: parts.game, eventBus: parts.eventBus },
    attacker,
    "rush",
    () =>
      parts.diceController.rollSkillCheck({
        reason: "Rush",
        target: activeRules().rushTarget,
        modifier: rushRollModifier(parts.state, attacker),
        playerName: attacker.playerName,
        ...request,
      })
  );
  return (
    check.success ||
    (await steadyFootingSaves(
      attacker,
      parts.diceController,
      parts.eventBus,
      parts.game
    ))
  );
}
