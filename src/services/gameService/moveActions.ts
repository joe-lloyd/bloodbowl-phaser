/**
 * Moving, standing up and jumping, each of which commits the declared
 * action once it has spent movement, and Fumblerooski's dropped ball.
 */

import { GameEventNames } from "@/types/events";
import { SkillType, hasSkill } from "@/types/Skills";
import type { GameParts } from "./parts";
import { awaitingSecondAction, whenSettled } from "./activation";

type Square = { x: number; y: number };

export async function movePlayer(
  parts: GameParts,
  playerId: string,
  path: Square[]
): Promise<void> {
  if (awaitingSecondAction(parts, playerId)) return;
  // Bombardier: "A player that declared a Throw Bomb Special Action may
  // not perform a Move Action before throwing the bomb" (p.125).
  const declared = parts.state.activePlayer;
  if (declared?.id === playerId && declared.action === "throwBomb") {
    throw new Error("A bomber may not move before throwing the bomb");
  }
  const context = parts.game.getFlowContext();
  await parts.movementManager.movePlayer(playerId, path, context);
  // The first square moved commits the declared action.
  parts.playerActionManager.commitAction(playerId);
}

export function dropBallWithFumblerooski(
  parts: GameParts,
  playerId: string,
  square: Square
): boolean {
  if (awaitingSecondAction(parts, playerId)) return false;
  const player = parts.game.getPlayerById(playerId);
  const active = parts.state.activePlayer;
  if (
    !player?.gridPosition ||
    active?.id !== playerId ||
    active.action !== "move" ||
    !hasSkill(player.skills, SkillType.FUMBLEROOSKI) ||
    !parts.ballManager.hasBall(playerId)
  ) {
    return false;
  }
  const dx = Math.abs(player.gridPosition.x - square.x);
  const dy = Math.abs(player.gridPosition.y - square.y);
  if (Math.max(dx, dy) !== 1 || parts.game.getPlayerAt(square.x, square.y)) {
    return false;
  }
  parts.game.setBallPosition(square.x, square.y);
  parts.eventBus.emit(GameEventNames.SkillTriggered, {
    playerId,
    skill: SkillType.FUMBLEROOSKI,
    effect: "Fumblerooski: left the ball behind without causing a Turnover",
  });
  return true;
}

export async function standUp(
  parts: GameParts,
  playerId: string
): Promise<void> {
  if (awaitingSecondAction(parts, playerId)) return;
  // Standing up in place is a Move Action. Declaring it rolls the
  // activation gate (Bone Head, Bloodlust, …) before the player rises,
  // and a failed gate that ends the activation leaves them Prone.
  if (parts.state.activePlayer?.id !== playerId) {
    if (!parts.game.declareAction(playerId, "move")) {
      throw new Error("This player cannot be activated");
    }
  }
  if (!(await whenSettled(parts))) return;
  // A gate can end the turn too: Animal Savagery downing the carrier
  if (
    parts.state.activePlayer?.id !== playerId ||
    parts.turnManager.isTurnoverInProgress()
  )
    return;
  await parts.movementManager.standUp(playerId);
  // Standing up spends movement — commits the declared action.
  parts.playerActionManager.commitAction(playerId);
}

export async function jumpPlayer(
  parts: GameParts,
  playerId: string,
  target: Square
): Promise<void> {
  if (awaitingSecondAction(parts, playerId)) return;
  const context = parts.game.getFlowContext();
  await parts.movementManager.jumpPlayer(playerId, target, context);
  parts.playerActionManager.commitAction(playerId);
}
