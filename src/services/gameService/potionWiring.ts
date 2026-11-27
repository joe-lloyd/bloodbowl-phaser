import { restingBall } from "@/game/rules/balls";
import { GameEventNames } from "@/types/events";
import { GamePhase } from "@/types/GameState";
import { BounceOperation } from "@/game/operations/BounceOperation";
import {
  type PotionHookServices,
  fungusBeerCollapse,
  orcaColaBreak,
} from "@/game/inducements/potionHooks";
import type { GameParts } from "./parts";
import { everyone } from "@/game/seating";
import { type IEventBus } from "../EventBus";

function hookServices(parts: GameParts): PotionHookServices {
  return {
    state: parts.state,
    eventBus: parts.eventBus,
    carries: (player) => parts.ballManager.hasBall(player.id),
    dropBall: (square) => {
      const ball = restingBall(parts.state, square);
      parts.game.placeBall(ball, square);
      parts.flowManager.add(new BounceOperation(square, { ball }), true);
    },
  };
}

export function bindPotionHooks(
  eventBus: IEventBus,
  getParts: () => GameParts
): void {
  eventBus.on(GameEventNames.PlayerActivated, (playerId: string) => {
    const parts = getParts();
    if (parts.state.phase !== GamePhase.PLAY) return;
    const player = parts.game.getPlayerById(playerId);
    if (player) orcaColaBreak(hookServices(parts), player);
  });
  eventBus.on(GameEventNames.TurnStarted, () => {
    const parts = getParts();
    fungusBeerCollapse(hookServices(parts), parts.diceController, everyone(parts.seating));
  });
}
