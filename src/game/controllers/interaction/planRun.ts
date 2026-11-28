import { settleActivationRoll } from "./activationRoll";
import { errorText } from "../../../ui/errorText";
import { GameEventNames } from "@/types/events";
import { getActiveOnlineMatch } from "@/network/OnlineMatch";
import type { GameplayInteractionController } from "../GameplayInteractionController";
import {
  type FinishKind,
  type PlanFinish,
  currentFinish,
  declarationOptions,
  finishKey,
  needsContact,
  plannedActor,
  reachNextTo,
  scenePlayer,
} from "./plan";
import { type Player, PlayerStatus } from "@/types/Player";
import type { RouteStep } from "../../rules/jump";
import { showSteps } from "./movement";
import { handoffTargetRefusalReason } from "../../rules/handoff";
import { planProblem, publishPlan } from "./planSummary";
import { cancelAction } from "./actionModes";
import { previewSquare } from "./previews";
import { afterMove, refreshPlayerVisualization, stoppedShort, walkRoute } from "./routes";
import { adjacentTo } from "./squares";
import { FINISHERS, type SquareClick } from "./stepClicks";

function refusesTarget(c: GameplayInteractionController, kind: FinishKind, target: Player | null): boolean {
  const hander = c.selectedPlayerId ? c.gameService.getPlayerById(c.selectedPlayerId) : undefined;
  if (kind !== "handoff" || !hander || !target) return false;
  const reason = handoffTargetRefusalReason(plannedActor(c, hander), target);
  if (!reason || reason === "not adjacent") return false;
  c.eventBus.emit(GameEventNames.UI_Notification, `Cannot hand off to ${target.playerName}: ${reason}.`);
  return true;
}

function showFinishStep(c: GameplayInteractionController, kind: FinishKind): void {
  if (c.currentStepId === kind || c.actionSteps.every((step) => step.id !== kind)) return;
  c.currentStepId = kind;
  showSteps(c);
  if (c.selectedPlayerId) refreshPlayerVisualization(c, c.selectedPlayerId);
}

export function planFinishAt(
  c: GameplayInteractionController,
  kind: FinishKind,
  click: SquareClick
): Promise<void> | void {
  const locked = currentFinish(c);
  if (locked?.x === click.x && locked.y === click.y) return goPlan(c);
  if (refusesTarget(c, kind, click.player)) return;
  if (needsContact(kind) && !reachNextTo(c, click)) return;
  c.jumpTargeting = false;
  c.finish = { kind, key: finishKey(c), x: click.x, y: click.y, targetId: click.player?.id ?? null };
  showFinishStep(c, kind);
  previewSquare(c, click.x, click.y);
  publishPlan(c);
}

function stopPlan(c: GameplayInteractionController, playerId: string, why: string): void {
  c.eventBus.emit(GameEventNames.UI_Notification, why);
  c.clearWaypoints();
  c.pitch.clearPath();
  const acting =
    c.selectedPlayerId === playerId &&
    c.gameService.canActivate(playerId) &&
    !c.gameService.hasPlayerActed(playerId);
  if (!acting) {
    c.deselectPlayer();
    return;
  }
  refreshPlayerVisualization(c, playerId);
  publishPlan(c);
}

async function declarePlanned(c: GameplayInteractionController, playerId: string): Promise<boolean> {
  const planned = c.undeclared;
  c.undeclared = null;
  if (!planned) return true;
  const declared = c.gameService.declareAction({
    playerId,
    action: planned.action,
    ...(planned.blockReplacement && { blockReplacement: planned.blockReplacement }),
    ...declarationOptions(planned),
  });
  if (!declared) {
    stopPlan(c, playerId, `Cannot declare ${planned.action} now.`);
    return false;
  }
  if (await settleActivationRoll(c, playerId, planned.action)) {
    publishPlan(c);
    return true;
  }
  stopPlan(c, playerId, "The activation roll changed the plan.");
  return false;
}

async function standPlanned(c: GameplayInteractionController, playerId: string): Promise<boolean> {
  c.isBusy = true;
  try {
    await c.gameService.standUp(playerId);
  } catch (error) {
    stopPlan(c, playerId, `Cannot stand up: ${errorText(error)}`);
    return false;
  } finally {
    c.isBusy = false;
  }
  afterMove(c, playerId);
  return c.gameService.getPlayerById(playerId)?.status === PlayerStatus.ACTIVE;
}

function risesFirst(c: GameplayInteractionController, playerId: string): boolean {
  return c.gameService.getPlayerById(playerId)?.status === PlayerStatus.PRONE;
}

async function walkPlanned(c: GameplayInteractionController, playerId: string, route: RouteStep[]): Promise<boolean> {
  c.isBusy = true;
  c.clearWaypoints();
  c.clearRollPreviews();
  c.pitch.clearPath();
  let walked: boolean;
  try {
    walked = await walkRoute(c, playerId, route);
  } catch (error) {
    c.isBusy = false;
    stopPlan(c, playerId, `Cannot move: ${errorText(error)}`);
    return false;
  } finally {
    c.isBusy = false;
  }
  if (!walked) {
    refreshPlayerVisualization(c, playerId);
    publishPlan(c);
    return false;
  }
  const end = route.at(-1);
  const reached = end !== undefined && !stoppedShort(c, playerId, end);
  afterMove(c, playerId);
  return reached;
}

function finishTarget(c: GameplayInteractionController, finish: PlanFinish): SquareClick | null {
  if (finish.targetId === null) return { x: finish.x, y: finish.y, player: c.getPlayerAt(finish.x, finish.y) };
  const player = scenePlayer(c, finish.targetId);
  const square = player?.gridPosition;
  return player && square ? { x: square.x, y: square.y, player } : null;
}

function finishPlanned(c: GameplayInteractionController, playerId: string, finish: PlanFinish): Promise<void> | void {
  c.clearRollPreviews();
  const click = finishTarget(c, finish);
  const actor = c.gameService.getPlayerById(playerId);
  if (!click || (needsContact(finish.kind) && !adjacentTo(actor?.gridPosition, click))) {
    stopPlan(c, playerId, "The target moved out of reach. Pick a new one.");
    return;
  }
  return FINISHERS[finish.kind](c, click);
}

function readyToGo(c: GameplayInteractionController): string | null {
  const playerId = c.selectedPlayerId;
  if (c.isBusy || !playerId || getActiveOnlineMatch()?.mayAct() === false) return null;
  const problem = planProblem(c);
  if (problem) c.eventBus.emit(GameEventNames.UI_Notification, problem);
  return problem ? null : playerId;
}

export async function goPlan(c: GameplayInteractionController): Promise<void> {
  const playerId = readyToGo(c);
  if (!playerId) return;
  const finish = currentFinish(c);
  const route = [...c.waypoints];
  c.dropFinish();
  c.jumpTargeting = false;
  if (c.undeclared && !(await declarePlanned(c, playerId))) return;
  if (route.length > 0 && !(await walkPlanned(c, playerId, route))) return;
  if (!finish) return;
  if (risesFirst(c, playerId) && !(await standPlanned(c, playerId))) return;
  await finishPlanned(c, playerId, finish);
}

export function clearPlan(c: GameplayInteractionController): void {
  const playerId = c.selectedPlayerId;
  if (c.isBusy || !playerId) return;
  if (c.undeclared && c.waypoints.length === 0 && !currentFinish(c)) {
    cancelAction(c);
    return;
  }
  c.jumpTargeting = false;
  if (currentFinish(c)) {
    c.dropFinish();
    c.clearRollPreviews();
    c.pitch.clearHover();
    c.pitch.clearPassVisualization();
  } else {
    c.clearWaypoints();
    c.clearRollPreviews();
    c.pitch.clearPath();
    refreshPlayerVisualization(c, playerId);
  }
  publishPlan(c);
}
