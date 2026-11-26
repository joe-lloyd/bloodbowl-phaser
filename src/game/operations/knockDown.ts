import { ballOnSquare } from "@/game/rules/ballInTheAir";
import { GameEventNames } from "../../types/events";
import { type Player, PlayerStatus } from "../../types/Player";
import { type FlowContext } from "../core/GameFlowManager";
import { BounceOperation } from "./BounceOperation";
import { InjuryOperation } from "./InjuryOperation";

export function knockDownPlayer(
  eventBus: FlowContext["eventBus"],
  player: Player
): void {
  player.status = PlayerStatus.PRONE;
  eventBus.emit(GameEventNames.PlayerKnockedDown, { playerId: player.id });
  eventBus.emit(GameEventNames.PlayerStatusChanged, player);
}

export function bounceIfBallUnder(
  context: Pick<FlowContext, "gameService" | "flowManager">,
  player: Player
): boolean {
  const square = player.gridPosition;
  if (!square || !ballOnSquare(context.gameService.getState(), square)) {
    return false;
  }
  context.flowManager.add(new BounceOperation({ ...square }), true);
  return true;
}

interface SpecialArmourHit {
  victim: Player;
  causedBy: Player | undefined;
  broken: boolean;
  injuryModifier: number;
  announceBreak: boolean;
}

export function settleSpecialArmour(
  context: FlowContext,
  hit: SpecialArmourHit
): boolean {
  const { eventBus, flowManager } = context;
  const { victim, causedBy } = hit;
  if (!hit.broken) {
    eventBus.emit(GameEventNames.UI_Notification, "Armour Holds.");
    return false;
  }
  if (hit.announceBreak) {
    eventBus.emit(GameEventNames.UI_Notification, "ARMOUR BROKEN!");
  }
  knockDownPlayer(eventBus, victim);
  bounceIfBallUnder(context, victim);
  flowManager.add(
    new InjuryOperation(victim.id, {
      modifier: hit.injuryModifier,
      ...(causedBy && { causedById: causedBy.id, cause: "special" }),
    }),
    true
  );
  return true;
}
