import { GameEventNames, type MovementHalf } from "@/types/events";
import {
  type Player,
  PlayerCondition,
  PlayerStatus,
  hasCondition,
} from "@/types/Player";
import { withDriveModifiers } from "../../kickoff/driveEffects";
import {
  JUMP_COST,
  type JumpTarget,
  legalJumpTargets,
  routeSquares,
} from "../../rules/jump";
import { moveAllowance, standUpCost } from "../../skills/movement";
import type { GameplayInteractionController } from "../GameplayInteractionController";
import { boardWith, plannedActor } from "./plan";

type Controller = GameplayInteractionController;

function standingCost(mover: Player): number {
  return mover.status === PlayerStatus.PRONE ? standUpCost(mover) : 0;
}

export function movementStarted(c: Controller, mover: Player): number {
  return c.gameService.getMovementUsed(mover.id) + standingCost(mover);
}

export function movementAfterRoute(c: Controller, mover: Player): number {
  return movementStarted(c, mover) + routeSquares(c.waypoints);
}

function standsForRoute(c: Controller, player: Player): boolean {
  if (player.status === PlayerStatus.ACTIVE) return true;
  return player.status === PlayerStatus.PRONE && c.waypoints.length > 0;
}

function heldInSquare(player: Player): boolean {
  return (
    hasCondition(player, PlayerCondition.ROOTED) ||
    hasCondition(player, PlayerCondition.CHOMPED)
  );
}

export function plannedJumpTargets(c: Controller, player: Player): JumpTarget[] {
  const mover = withDriveModifiers(player, c.gameService.getState());
  const spent = movementAfterRoute(c, mover) + JUMP_COST;
  if (
    !standsForRoute(c, player) ||
    heldInSquare(player) ||
    spent > moveAllowance(mover)
  )
    return [];
  const actor = plannedActor(c, player);
  return actor.gridPosition
    ? legalJumpTargets(actor, actor.gridPosition, boardWith(c, actor))
    : [];
}

function mayRiseNow(c: Controller, player: Player): boolean {
  if (player.status !== PlayerStatus.PRONE || c.waypoints.length > 0)
    return false;
  const mover = withDriveModifiers(player, c.gameService.getState());
  return movementStarted(c, mover) <= moveAllowance(mover);
}

export function movementHalf(c: Controller): MovementHalf | null {
  const player = c.selectedPlayerId
    ? c.gameService.getPlayerById(c.selectedPlayerId)
    : undefined;
  if (!player || c.actionSteps.every((step) => step.id !== "move")) return null;
  if (mayRiseNow(c, player)) return "standup";
  return plannedJumpTargets(c, player).length > 0 ? "jump" : null;
}

export function showSteps(c: Controller): void {
  const half = movementHalf(c);
  c.shownHalf = half;
  c.eventBus.emit(GameEventNames.UI_UpdateActionSteps, {
    steps: c.actionSteps.map((step) =>
      half && step.id === "move" ? { ...step, half } : step
    ),
    currentStepId: c.jumpTargeting ? "jump" : (c.currentStepId ?? "move"),
  });
}

export function syncMovementHalf(c: Controller): void {
  if (c.actionSteps.length > 0 && movementHalf(c) !== c.shownHalf) showSteps(c);
}
