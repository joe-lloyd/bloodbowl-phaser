import { GameEventNames } from "@/types/events";
import { getActiveOnlineMatch } from "@/network/OnlineMatch";
import type { GameplayInteractionController } from "../GameplayInteractionController";
import {
  type FinishKind,
  type PlanFinish,
  type PlannedDeclaration,
  currentFinish,
  finishKey,
  needsContact,
  plannedActor,
  reachNextTo,
} from "./plan";
import type { Player } from "@/types/Player";
import { handoffTargetRefusalReason } from "../../rules/handoff";
import { planProblem, publishPlan } from "./planSummary";
import { previewSquare } from "./previews";
import { afterMove, refreshPlayerVisualization, stoppedShort, walkRoute } from "./routes";
import { FINISHERS, type SquareClick } from "./stepClicks";

interface Square {
  x: number;
  y: number;
}

function refusesTarget(c: GameplayInteractionController, kind: FinishKind, target: Player | null): boolean {
  const hander = c.selectedPlayerId ? c.gameService.getPlayerById(c.selectedPlayerId) : undefined;
  if (kind !== "handoff" || !hander || !target) return false;
  const reason = handoffTargetRefusalReason(plannedActor(c, hander), target);
  if (!reason || reason === "not adjacent") return false;
  c.eventBus.emit(GameEventNames.UI_Notification, `Cannot hand off to ${target.playerName}: ${reason}.`);
  return true;
}

function showFinishStep(c: GameplayInteractionController, kind: FinishKind): void {
  if (c.currentStepId === kind || !c.actionSteps.some((step) => step.id === kind)) return;
  c.currentStepId = kind;
  c.eventBus.emit(GameEventNames.UI_UpdateActionSteps, {
    steps: c.actionSteps,
    currentStepId: kind,
  });
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
  c.finish = { kind, key: finishKey(c), x: click.x, y: click.y };
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

function stillPlanned(c: GameplayInteractionController, playerId: string, planned: PlannedDeclaration): boolean {
  if (c.gameService.runsCommandsLater) return true;
  const active = c.gameService.getState().activePlayer;
  return (
    active?.id === playerId &&
    active.action === planned.action &&
    !c.gameService.hasPlayerActed(playerId)
  );
}

async function declarePlanned(c: GameplayInteractionController, playerId: string): Promise<boolean> {
  const planned = c.undeclared;
  c.undeclared = null;
  if (!planned) return true;
  const declared = c.gameService.declareAction({
    playerId,
    action: planned.action,
    ...(planned.blockReplacement ? { blockReplacement: planned.blockReplacement } : {}),
    ...(planned.razzleDazzle ? { options: { razzleDazzle: true } } : {}),
  });
  if (!declared) {
    stopPlan(c, playerId, `Cannot declare ${planned.action} now.`);
    return false;
  }
  c.isBusy = true;
  try {
    await c.gameService.getFlowContext().flowManager.whenIdle();
    await c.dice.landed();
  } finally {
    c.isBusy = false;
  }
  if (stillPlanned(c, playerId, planned)) return true;
  stopPlan(c, playerId, "The activation roll changed the plan.");
  return false;
}

async function walkPlanned(c: GameplayInteractionController, playerId: string, route: Square[]): Promise<boolean> {
  c.isBusy = true;
  c.clearWaypoints();
  c.clearRollPreviews();
  c.pitch.clearPath();
  let walked = false;
  try {
    walked = await walkRoute(c, playerId, route);
  } catch (error) {
    console.error("Move failed", error);
    c.deselectPlayer();
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

function finishPlanned(c: GameplayInteractionController, finish: PlanFinish): Promise<void> | void {
  c.clearRollPreviews();
  return FINISHERS[finish.kind](c, {
    x: finish.x,
    y: finish.y,
    player: c.getPlayerAt(finish.x, finish.y),
  });
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
  if (c.undeclared && !(await declarePlanned(c, playerId))) return;
  if (route.length > 0 && !(await walkPlanned(c, playerId, route))) return;
  if (finish) await finishPlanned(c, finish);
}

export function clearPlan(c: GameplayInteractionController): void {
  const playerId = c.selectedPlayerId;
  if (c.isBusy || !playerId) return;
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
