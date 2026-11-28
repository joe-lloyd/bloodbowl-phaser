import type { ActionType, MovementHalf } from "@/types/events";
import { errorText } from "../../../ui/errorText";
import { GameEventNames } from "@/types/events";
import { PlayerStatus } from "@/types/Player";
import { type GameState } from "@/types/GameState";
import { isTurnRunning } from "../../kickoff/kickoffTurn";
import { rageLeavesOpen } from "@/game/rules/awaitingDeclaration";
import {
  type BlockReplacement,
  blockReplacementForDirectAction,
} from "@/types/BlockReplacement";
import { getActiveOnlineMatch } from "@/network/OnlineMatch";
import type { GameplayInteractionController } from "../GameplayInteractionController";
import { actionStepsFor } from "./actionSteps";
import { drawJumpAim } from "./previews";
import { afterMove, refreshPlayerVisualization } from "./routes";
import { movementHalf, showSteps } from "./movement";
import { gateRequest } from "./Confirmations";
import { activationGates } from "../../skills";
import type { ActivationGate } from "../../skills/SkillRule";
import { declarationOptions, plansBeforeDeclaring } from "./plan";
import { publishPlan } from "./planSummary";

export function enterActionMode(
{ c,playerId,action,blockReplacement }: { c: GameplayInteractionController; playerId: string; action: ActionType; blockReplacement: BlockReplacement|null; }): void {
  c.currentActionMode = action;
  c.currentBlockReplacement = blockReplacement;
  c.hasMovedInAction = false;

  c.interactionSeq++;

  if (action === "multipleBlock") c.multipleBlockFirstTargetId = null;
  else if (action === "throwTeamMate") c.ttmTeammateId = null;
  c.actionSteps = actionStepsFor(action, blockReplacement);

  const defaultStep = c.actionSteps[0]?.id ?? "move";

  const declarer = c.gameService.getPlayerById(playerId);
  if (
    declarer?.status === PlayerStatus.PRONE &&
    c.actionSteps.every((step) => step.id !== "move")
  ) {
    c.actionSteps.unshift({ id: "standup", label: "Stand Up" });
    c.currentStepId = "standup";
  } else {
    c.currentStepId = defaultStep;
  }

  c.jumpTargeting = false;
  showSteps(c);

  c.eventBus.emit(GameEventNames.ActionModeChanged, {
    playerId: playerId,
    action: action,
    ...(blockReplacement && { blockReplacement }),
    autoSelectMove: true,
  });

  refreshPlayerVisualization(c, playerId);
}

function gatesForAction(c: GameplayInteractionController, data: Parameters<typeof selectAction>[1]) {
  if (data.action === "forgoe") return null;
  return askGates(c, data.playerId, data.action);
}

function planWithoutDeclaring(
  c: GameplayInteractionController,
  data: Parameters<typeof selectAction>[1],
  blockReplacement: BlockReplacement | null
): boolean {
  const deferrable =
    !data.razzleDazzle &&
    plansBeforeDeclaring(data.action, blockReplacement) &&
    defersGates(c, data.playerId, data.action);
  if (!deferrable) return false;
  c.undeclared = {
    action: data.action,
    blockReplacement,
    razzleDazzle: false,
    ...(data.against !== undefined && { against: data.against }),
  };
  enterActionMode({ c, playerId: data.playerId, action: data.action, blockReplacement });
  publishPlan(c);
  return true;
}

export async function selectAction(
  c: GameplayInteractionController,
  data: {
    action: ActionType;
    playerId: string;
    blockReplacement?: BlockReplacement;
    razzleDazzle?: boolean;
    half?: MovementHalf;
    against?: string;
  }
): Promise<void> {
  const blockReplacement =
    data.blockReplacement ??
    blockReplacementForDirectAction(data.action) ??
    null;
  if (planWithoutDeclaring(c, data, blockReplacement)) {
    if (data.half) selectStep(c, { stepId: data.half });
    return;
  }
  c.undeclared = null;
  const asked = gatesForAction(c, data);
  if (asked && !(await asked)) return;

  if (data.action === "forgoe") {
    c.gameService.finishActivation(data.playerId);
    c.deselectPlayer();
    return;
  }

  declareNow(c, data, blockReplacement);
}

function declareNow(
  c: GameplayInteractionController,
  data: Parameters<typeof selectAction>[1],
  blockReplacement: BlockReplacement | null
): void {
  const success = c.gameService.declareAction({
    playerId: data.playerId,
    action: data.action,
    ...(blockReplacement && { blockReplacement }),
    ...declarationOptions(data),
  });
  if (success) {
    enterActionMode({ c,playerId: data.playerId,action: data.action,blockReplacement });
    if (data.half) selectStep(c, { stepId: data.half });
  } else {
    console.log("Failed to declare action:", data.action);
    c.eventBus.emit(
      GameEventNames.UI_Notification,
      `Cannot declare ${data.action} (Already used?)`
    );
  }
}

function standUpStep(c: GameplayInteractionController, playerId: string): void {
  c.gameService
    .standUp(playerId)
    .then(() => {
      const after = c.gameService.getPlayerById(playerId);
      if (after?.status !== PlayerStatus.ACTIVE) {
        c.deselectPlayer();
        return;
      }
      c.actionSteps = c.actionSteps.filter((s) => s.id !== "standup");

      c.currentStepId = c.actionSteps[0]?.id ?? "move";
      showSteps(c);
      afterMove(c, playerId);
    })
    .catch((error: unknown) => {
      c.eventBus.emit(
        GameEventNames.UI_Notification,
        `Cannot Stand Up: ${errorText(error)}`
      );
    });
}

function jumpStep(c: GameplayInteractionController, playerId: string): void {
  c.jumpTargeting = true;
  c.currentStepId = "move";
  showSteps(c);
  refreshPlayerVisualization(c, playerId);
  drawJumpAim(c, playerId);
  c.eventBus.emit(
    GameEventNames.UI_Notification,
    "Jump: pick a highlighted landing square to add it to the plan."
  );
}

function availableStep(c: GameplayInteractionController, stepId: string): boolean {
  if (c.actionSteps.some((step) => step.id === stepId)) return true;
  if (movementHalf(c) === stepId) return true;
  console.warn("Invalid step selected:", stepId);
  return false;
}

export function selectStep(
  c: GameplayInteractionController,
  data: { stepId: string }
): void {
  if (!availableStep(c, data.stepId)) return;

  if (data.stepId === "standup" && c.selectedPlayerId) {
    standUpStep(c, c.selectedPlayerId);
    return;
  }
  if (data.stepId === "jump" && !c.jumpTargeting && c.selectedPlayerId) {
    jumpStep(c, c.selectedPlayerId);
    return;
  }

  c.jumpTargeting = false;
  c.currentStepId = data.stepId === "jump" ? "move" : data.stepId;
  showSteps(c);
  console.log(`Switched action step to: ${data.stepId}`);

  if (c.selectedPlayerId) {
    refreshPlayerVisualization(c, c.selectedPlayerId);
  }

  if (c.lastHoverGrid) {
    c.onSquareHovered(c.lastHoverGrid.x, c.lastHoverGrid.y);
  } else {
    c.pitch.clearPassVisualization();
    c.pitch.clearPath();
  }
}

function forgetAction(c: GameplayInteractionController, playerId: string): void {
  c.dropFinish();
  c.clearWaypoints();
  c.pitch.clearPath();
  c.currentActionMode = null;
  c.currentBlockReplacement = null;
  c.currentStepId = null;
  c.actionSteps = [];
  c.jumpTargeting = false;
  c.pitch.clearPassVisualization();
  c.interactionSeq++;
  const player = c.gameService.getPlayerById(playerId);
  if (player) {
    c.eventBus.emit(GameEventNames.PlayerSelected, { player });
    refreshPlayerVisualization(c, playerId);
  }
  publishPlan(c);
}

export function cancelAction(c: GameplayInteractionController): void {
  if (!c.selectedPlayerId) return;
  if (c.undeclared) {
    c.undeclared = null;
    forgetAction(c, c.selectedPlayerId);
    return;
  }

  if (c.hasMovedInAction) {
    console.warn("Cannot cancel action after moving");
    return;
  }

  if (!c.gameService.cancelAction(c.selectedPlayerId)) {
    c.eventBus.emit(
      GameEventNames.UI_Notification,
      "This Action is already committed and cannot be cancelled."
    );
    return;
  }

  const playerId = c.selectedPlayerId;
  forgetAction(c, playerId);
  c.pendingCancelSeqByPlayer.set(playerId, c.interactionSeq);
}

export function reconcileRejectedCommand(
  c: GameplayInteractionController,
  data: {
    commandType: string;
    playerId?: string;
    action?: string;
    reason: string;
  }
): void {
  if (data.commandType === "choose-bite-target") {
    c.targets.markPendingBite();
    return;
  }
  if (!c.selectedPlayerId || data.playerId !== c.selectedPlayerId) {
    return;
  }
  const stale =
    (data.commandType === "declare-action" &&
      c.currentActionMode === data.action) ||
    (data.commandType === "cancel-action" &&
      c.pendingCancelSeqByPlayer.get(data.playerId) === c.interactionSeq);
  if (!stale) return;

  const playerId = c.selectedPlayerId;
  c.pendingCancelSeqByPlayer.delete(playerId);
  c.deselectPlayer();
  c.eventBus.emit(
    GameEventNames.UI_Notification,
    "The board was out of sync — your last action wasn't accepted. Please reselect the player."
  );

  c.selectPlayer(playerId);
}

export function endActivation(c: GameplayInteractionController): void {
  const playerId = c.selectedPlayerId;
  if (!playerId) return;
  const before = c.gameService.getState();
  const teamId = before.activeTeamId;
  const turn = before.turn;
  c.gameService.finishActivation(playerId);

  if (c.selectedPlayerId !== playerId) return;
  c.deselectPlayer();
  const state = c.gameService.getState();
  if (
    teamId &&
    state.activeTeamId === teamId &&
    state.turn === turn &&
    (!state.activePlayer || c.gameService.runsCommandsLater) &&
    isTurnRunning(state)
  ) {
    c.eventBus.emit(GameEventNames.Camera_ChooseNextPlayer, {
      teamId,
      playerId,
    });
  }
}

function controlsPlayer(teamId: string): boolean {
  const online = getActiveOnlineMatch();
  return !online || online.myTeamId === teamId;
}

function resumablePlayer(c: GameplayInteractionController, playerId: string) {
  const player = c.gameService.getPlayerById(playerId);
  if (!player || c.gameService.hasPlayerActed(playerId)) return null;
  return controlsPlayer(player.teamId) ? player : null;
}

export function resumeBlitzMove(
  c: GameplayInteractionController,
  playerId: string
): void {
  const player = resumablePlayer(c, playerId);
  if (!player) return;
  c.selectedPlayerId = playerId;
  c.currentActionMode = "blitz";
  c.currentStepId = "move";
  c.hasMovedInAction = true;
  c.clearWaypoints();
  c.pitch.clearPath();
  c.scene.highlightPlayer(playerId);
  c.eventBus.emit(GameEventNames.PlayerSelected, { player });
  c.actionSteps = actionStepsFor("move", null);
  showSteps(c);
  refreshPlayerVisualization(c, playerId);
}

export function resumeBallAndChain(
  c: GameplayInteractionController,
  playerId: string
): void {
  const player = resumablePlayer(c, playerId);
  if (!player) return;
  c.selectedPlayerId = playerId;
  c.currentActionMode = "ballAndChain";
  c.currentStepId = "swing";
  c.hasMovedInAction = true;
  c.scene.highlightPlayer(playerId);
  c.eventBus.emit(GameEventNames.PlayerSelected, { player });
  c.actionSteps = actionStepsFor("ballAndChain", null);
  showSteps(c);
  c.eventBus.emit(GameEventNames.PlayerMovedInAction, { playerId });
  refreshPlayerVisualization(c, playerId);
}

function pendingGates(
  c: GameplayInteractionController,
  playerId: string,
  action: ActionType
): ActivationGate[] {
  if (c.gameService.getState().activePlayer?.id === playerId) return [];
  const player = c.gameService.getPlayerById(playerId);
  if (!player) return [];
  return activationGates(player, action, c.gameService.getTeammates(playerId));
}

export function defersGates(
  c: GameplayInteractionController,
  playerId: string,
  action: ActionType
): boolean {
  const prone = c.gameService.getPlayerById(playerId)?.status === PlayerStatus.PRONE;
  return !c.gameService.runsCommandsLater && !prone && pendingGates(c, playerId, action).length > 0;
}

export function askGates(
  c: GameplayInteractionController,
  playerId: string,
  action: ActionType
): Promise<boolean> | null {
  const gates = pendingGates(c, playerId, action);
  const player = c.gameService.getPlayerById(playerId);
  if (gates.length === 0 || !player) return null;
  const asked = c.confirmations.ask("gate", gateRequest(player, gates));

  return asked.then(
    (confirmed) => confirmed && c.selectedPlayerId === playerId
  );
}

function releaseActive(
  c: GameplayInteractionController,
  active: NonNullable<GameState["activePlayer"]>
): void {
  if (active.committed) {
    c.gameService.finishActivation(active.id);
    return;
  }
  const unspent =
    active.action !== null && c.gameService.getMovementUsed(active.id) === 0;
  if (unspent || !rageLeavesOpen(active)) c.gameService.cancelAction(active.id);
  if (rageLeavesOpen(active)) c.gameService.finishActivation(active.id);
}

function releasePreviousPlayer(
{ c,playerId,active,ownTeamsTurn }: { c: GameplayInteractionController; playerId: string; active: GameState["activePlayer"]; ownTeamsTurn: boolean; }): void {
  if (active && active.id !== playerId && ownTeamsTurn) {
    releaseActive(c, active);
  } else if (!active && c.selectedPlayerId && c.selectedPlayerId !== playerId) {
    const prevId = c.selectedPlayerId;
    if (
      c.gameService.getMovementUsed(prevId) > 0 &&
      !c.gameService.hasPlayerActed(prevId)
    ) {
      c.gameService.finishActivation(prevId);
    }
  }
}

export function selectPlayer(
  c: GameplayInteractionController,
  playerId: string
): void {
  const player = c.gameService.getPlayerById(playerId);

  if (!player) return;

  const state = c.gameService.getState();
  const ownTeamsTurn = state.activeTeamId === player.teamId;
  releasePreviousPlayer({ c,playerId,active: state.activePlayer,ownTeamsTurn });

  c.deselectPlayer();
  c.selectedPlayerId = playerId;

  c.scene.highlightPlayer(playerId);

  c.eventBus.emit(GameEventNames.PlayerSelected, { player });

  const resumed = c.gameService.getState().activePlayer;
  if (
    resumed?.id === playerId &&
    resumed.action &&
    !resumed.razzleDazzle?.awaitingSecond &&
    ownTeamsTurn &&
    !c.gameService.hasPlayerActed(playerId)
  ) {
    enterActionMode(
      { c,playerId,action: resumed.action,blockReplacement: resumed.blockReplacement??null }    );
    c.hasMovedInAction = c.gameService.getMovementUsed(playerId) > 0;
    return;
  }

  refreshPlayerVisualization(c, playerId);
}

export function resumeActivePlayer(c: GameplayInteractionController): void {
  const active = c.gameService.getState().activePlayer;
  const player = active ? c.gameService.getPlayerById(active.id) : null;
  if (!active?.action || !player) return;
  if (!controlsPlayer(player.teamId)) return;
  c.selectPlayer(active.id);
}
