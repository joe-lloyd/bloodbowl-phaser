import { kickoffTurnOf } from "@/game/kickoff/kickRecord";
import { actionHasMove } from "@/game/rules/actionAvailability";
import { kickoffTurnAllows } from "@/game/kickoff/kickoffTurn";
import type { Player } from "@/types/Player";
import { adjacentSquare } from "./squares";
import { GameEventNames } from "@/types/events";
import { SkillType, hasSkill } from "@/types/Skills";
import type { GameParts } from "./parts";
import { awaitingSecondAction, whenSettled } from "./activation";
import type { MoveStep } from "../../headless/protocol";

interface Square {
  x: number;
  y: number;
}

function refuseOutsideKickoffTurn(parts: GameParts, playerId: string): void {
  const { activePlayer } = parts.state;
  const action =
    activePlayer?.id === playerId ? (activePlayer.action ?? "move") : "move";
  if (!kickoffTurnOf(parts.state)) return;
  if (
    !parts.game.canActivate(playerId) ||
    !kickoffTurnAllows(parts.state, action) ||
    !actionHasMove(action)
  )
    throw new Error("player-not-in-kickoff-turn");
}

export async function movePlayer(
  parts: GameParts,
  playerId: string,
  path: MoveStep[]
): Promise<void> {
  if (awaitingSecondAction(parts, playerId)) return;
  refuseOutsideKickoffTurn(parts, playerId);

  const declared = parts.state.activePlayer;
  if (declared?.id === playerId && declared.action === "throwBomb") {
    throw new Error("A bomber may not move before throwing the bomb");
  }
  const context = parts.game.getFlowContext();
  await parts.movementManager.movePlayer(playerId, path, context);

  parts.playerActionManager.commitAction(playerId);
}

export function dropBallWithFumblerooski(
  parts: GameParts,
  playerId: string,
  square: Square
): boolean {
  if (awaitingSecondAction(parts, playerId)) return false;
  const player = parts.game.getPlayerById(playerId);
  if (!player?.gridPosition || !canDropFumblerooski(parts, playerId, player))
    return false;
  if (
    !adjacentSquare(player.gridPosition, square) ||
    parts.game.getPlayerAt(square.x, square.y)
  ) {
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
  refuseOutsideKickoffTurn(parts, playerId);

  if (parts.state.activePlayer?.id !== playerId) {
    if (!parts.game.declareAction({ playerId, action: "move" })) {
      throw new Error("This player cannot be activated");
    }
  }
  if (!(await whenSettled(parts))) return;

  if (
    parts.state.activePlayer?.id !== playerId ||
    parts.turnManager.isTurnoverInProgress()
  )
    return;
  await parts.movementManager.standUp(playerId);

  parts.playerActionManager.commitAction(playerId);
}

export async function jumpPlayer(
  parts: GameParts,
  playerId: string,
  target: Square
): Promise<void> {
  if (awaitingSecondAction(parts, playerId)) return;
  refuseOutsideKickoffTurn(parts, playerId);
  const context = parts.game.getFlowContext();
  await parts.movementManager.jumpPlayer(playerId, target, context);
  parts.playerActionManager.commitAction(playerId);
}

function canDropFumblerooski(
  parts: GameParts,
  playerId: string,
  player: Player
): boolean {
  const active = parts.state.activePlayer;
  return (
    active?.id === playerId &&
    active.action === "move" &&
    hasSkill(player.skills, SkillType.FUMBLEROOSKI) &&
    parts.ballManager.hasBall(playerId)
  );
}
