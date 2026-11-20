import { activeRules } from "@/game/variants/activeMatch";
import { steadyFootingSaves } from "@/game/rules/steadyFooting";
import { withRerollOffer } from "@/game/skills";
import { rushModifier } from "@/game/inducements/matchInducements";
import type { Player } from "@/types/Player";
import type { GameParts } from "./parts";

interface RushRequest {
  teamId?: string;
}

export async function rushSucceeds(
  parts: GameParts,
  attacker: Player,
  request: RushRequest = {}
): Promise<boolean> {
  const check = await withRerollOffer(
    { gameService: parts.game, eventBus: parts.eventBus },
    attacker,
    "rush",
    () =>
      parts.diceController.rollSkillCheck({
        reason: "Rush",
        target: activeRules().rushTarget,
        modifier: rushModifier(parts.state, attacker),
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
