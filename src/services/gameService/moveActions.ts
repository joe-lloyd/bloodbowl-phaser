import { kickoffTurnOf } from "@/game/kickoff/kickRecord";
import { usesBaseMove } from "@/game/rules/actionAvailability";
import { kickoffTurnAllows } from "@/game/kickoff/kickoffTurn";
import type { Player } from "@/types/Player";
import { adjacentSquare } from "./squares";
import { type ActionType, GameEventNames } from "@/types/events";
import { SkillType, hasSkill } from "@/types/Skills";
import type { GameParts } from "./parts";
import { awaitingSecondAction, whenSettled } from "./activation";
import { mustRedeclare } from "@/game/rules/awaitingDeclaration";
import type { MoveStep } from "../../headless/protocol";

interface Square {
  x: number;
  y: number;
}

function declaredAction(parts: GameParts, playerId: string): ActionType {
  const { activePlayer } = parts.state;
  return activePlayer?.id === playerId
    ? (activePlayer.action ?? "move")
    : "move";
}

function refuseOutsideKickoffTurn(
  parts: GameParts,
  playerId: string,
  action: ActionType
): void {
  if (!kickoffTurnOf(parts.state)) return;
  if (
    !parts.game.canActivate(playerId) ||
    !kickoffTurnAllows(parts.state, action)
  )
    throw new Error("player-not-in-kickoff-turn");
}

function mayStandToBlock(player: Player | undefined, action: ActionType) {
  return action === "block" && !!player && hasSkill(player.skills, SkillType.JUMP_UP);
}

function mayUseBaseMove(
  parts: GameParts,
  playerId: string,
  kind: "move" | "stand"
): boolean {
  if (awaitingSecondAction(parts, playerId)) return false;
  const action = declaredAction(parts, playerId);
  refuseOutsideKickoffTurn(parts, playerId, action);
  const standsToBlock =
    kind === "stand" &&
    mayStandToBlock(parts.game.getPlayerById(playerId), action);
  if (!usesBaseMove(action) && !standsToBlock)
    throw new Error(`A player may not move during a ${action} action`);
  return true;
}

export async function movePlayer(
  parts: GameParts,
  playerId: string,
  path: MoveStep[]
): Promise<void> {
  if (!mayUseBaseMove(parts, playerId, "move")) return;

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

function declareMove(parts: GameParts, playerId: string): void {
  if (!parts.game.declareAction({ playerId, action: "move" })) {
    throw new Error("This player cannot be activated");
  }
}

function declareMoveToStand(parts: GameParts, playerId: string): boolean {
  if (mustRedeclare(parts.state, playerId)) {
    declareMove(parts, playerId);
    return true;
  }
  if (!mayUseBaseMove(parts, playerId, "stand")) return false;
  if (parts.state.activePlayer?.id !== playerId) declareMove(parts, playerId);
  return true;
}

function mayStand(parts: GameParts, playerId: string): boolean {
  const active = parts.state.activePlayer;
  return (
    active?.id === playerId &&
    !active.forcedBlock &&
    !mustRedeclare(parts.state, playerId) &&
    !parts.turnManager.isTurnoverInProgress()
  );
}

export async function standUp(
  parts: GameParts,
  playerId: string
): Promise<void> {
  if (!declareMoveToStand(parts, playerId)) return;
  if (!(await whenSettled(parts))) return;

  if (!mayStand(parts, playerId)) return;
  await parts.movementManager.standUp(playerId);

  parts.playerActionManager.commitAction(playerId);
}

export async function jumpPlayer(
  parts: GameParts,
  playerId: string,
  target: Square
): Promise<void> {
  if (!mayUseBaseMove(parts, playerId, "move")) return;
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
