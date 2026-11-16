/**
 * Declaring an action and moving through its steps: the action menu, the
 * stepper, Back, and putting a player back into an action the engine
 * already holds after a Blitz block, a Ball & Chain square or a resync.
 *
 * selectAction awaits where onActionSelected did before the split: the
 * negatrait confirm, and Stand Up. Without a negatrait to ask about, the
 * declaration goes out in the tick of the menu click.
 */

import type { ActionType } from "@/types/events";
import { GameEventNames } from "@/types/events";
import { PlayerStatus } from "@/types/Player";
import { GamePhase, type GameState } from "@/types/GameState";
import {
  BlockReplacement,
  blockReplacementForDirectAction,
} from "@/types/BlockReplacement";
import { getActiveOnlineMatch } from "@/network/OnlineMatch";
import type { GameplayInteractionController } from "../GameplayInteractionController";
import { actionStepsFor } from "./actionSteps";
import { computeJumpTargets } from "./previews";
import { refreshPlayerVisualization } from "./routes";
import { gateRequest } from "./Confirmations";
import { activationGates } from "../../skills";
import type { ActivationGate } from "../../skills/SkillRule";

/**
 * Put the board into a declared action: its steps, its opening step and
 * the movement overlay. Used when the coach declares, and when a restore
 * hands back a player the engine already has mid-action.
 */
export function enterActionMode(
  c: GameplayInteractionController,
  playerId: string,
  action: ActionType,
  blockReplacement: BlockReplacement | null
): void {
  // Set action mode state
  c.currentActionMode = action;
  c.currentBlockReplacement = blockReplacement;
  c.hasMovedInAction = false;
  // Local state moved on — invalidates any cancel-action rejection
  // still in flight for this player (see onNetworkCommandRejected).
  c.interactionSeq++;

  // Define steps based on action. Multiple Block starts with no target
  // picked, and Throw Team-mate with no team-mate.
  if (action === "multipleBlock") c.multipleBlockFirstTargetId = null;
  if (action === "throwTeamMate") c.ttmTeammateId = null;
  c.actionSteps = actionStepsFor(action, blockReplacement);

  // The opening step is always the action's own first step. Deriving it
  // from the list (rather than assuming "move") keeps single-step actions
  // — Block, Throw Bomb, Ball & Chain, the special attacks — on a step
  // their click handler actually matches; a hard-coded "move" left them
  // on a step no branch claimed, so their clicks fell through.
  const defaultStep = c.actionSteps[0]?.id ?? "move";

  // A prone player stands up first — same activation, costs movement
  const declarer = c.gameService.getPlayerById(playerId);
  if (declarer?.status === PlayerStatus.PRONE) {
    c.actionSteps.unshift({ id: "standup", label: "Stand Up" });
    c.currentStepId = "standup";
  } else {
    c.currentStepId = defaultStep;
  }

  // Emit Step Info
  c.eventBus.emit(GameEventNames.UI_UpdateActionSteps, {
    steps: c.actionSteps,
    currentStepId: c.currentStepId,
  });

  // Emit ActionModeChanged event for UI (Legacy?)
  c.eventBus.emit(GameEventNames.ActionModeChanged, {
    playerId: playerId,
    action: action,
    blockReplacement: blockReplacement ?? undefined,
    autoSelectMove: true,
  });

  // Don't call selectPlayer here - it causes PlayerSelected event
  // which resets the action mode we just set!
  // The player is already selected, no need to refresh

  // Update visuals to reflect new mode (e.g. Pass might hide movement range or show pass zones)
  refreshPlayerVisualization(c, playerId);
}

export async function selectAction(
  c: GameplayInteractionController,
  data: {
    action: ActionType;
    playerId: string;
    blockReplacement?: BlockReplacement;
    razzleDazzle?: boolean;
  }
): Promise<void> {
  // A negatrait roll binds the player to the action: ask before it
  const asked =
    data.action === "forgoe"
      ? null
      : askGates(
          c,
          data.playerId,
          data.action === "standUp" ? "move" : data.action
        );
  if (asked && !(await asked)) return;

  // Immediate Actions
  if (data.action === "standUp") {
    try {
      await c.gameService.standUp(data.playerId);
      c.selectPlayer(data.playerId);
    } catch (err) {
      console.error("Stand Up failed:", err);
      c.eventBus.emit(
        GameEventNames.UI_Notification,
        `Cannot Stand Up: ${err}`
      );
    }
    return;
  }

  if (data.action === "forgoe") {
    c.gameService.finishActivation(data.playerId);
    c.deselectPlayer();
    return;
  }

  // Mode-Setting Actions (Blitz, Pass, Move, etc.)
  const blockReplacement =
    data.blockReplacement ??
    blockReplacementForDirectAction(data.action) ??
    null;
  const success = c.gameService.declareAction(
    data.playerId,
    data.action,
    blockReplacement ?? undefined,
    ...(data.razzleDazzle ? [{ razzleDazzle: true }] : [])
  );
  if (success) {
    enterActionMode(c, data.playerId, data.action, blockReplacement);
  } else {
    console.log("Failed to declare action:", data.action);
    c.eventBus.emit(
      GameEventNames.UI_Notification,
      `Cannot declare ${data.action} (Already used?)`
    );
  }
}

// Stand Up executes immediately and hands over to the action's next step
function standUpStep(c: GameplayInteractionController, playerId: string): void {
  c.gameService
    .standUp(playerId)
    .then(() => {
      // A Jump Up player standing to make a declared Block must pass an
      // Agility test; on a failure they are still Prone and the Action is
      // spent, so there is no next step to advance to.
      const after = c.gameService.getPlayerById(playerId);
      if (after?.status !== PlayerStatus.ACTIVE) {
        c.deselectPlayer();
        return;
      }
      c.actionSteps = c.actionSteps.filter((s) => s.id !== "standup");
      // Advance to whatever the action's own next step is — a Block
      // action has no "move" step, so assuming one stranded it.
      c.currentStepId = c.actionSteps[0]?.id ?? "move";
      c.eventBus.emit(GameEventNames.UI_UpdateActionSteps, {
        steps: c.actionSteps,
        currentStepId: c.currentStepId,
      });
      refreshPlayerVisualization(c, playerId);
    })
    .catch((err) => {
      c.eventBus.emit(
        GameEventNames.UI_Notification,
        `Cannot Stand Up: ${err}`
      );
    });
}

// Jump step: enter Jump targeting — a snapped two-square arrow follows the
// pointer and a click leaps in that compass direction. Kept OFF of
// currentStepId (the Move step stays current, never marked done) since a
// Jump does not consume the Move.
function jumpStep(c: GameplayInteractionController, playerId: string): void {
  c.jumpTargeting = true;
  const player = c.gameService.getPlayerById(playerId);
  const targets = player ? computeJumpTargets(c, player) : [];
  if (player?.gridPosition) {
    c.pitch.drawJumpTargets(player.gridPosition, targets);
  }
  c.eventBus.emit(
    GameEventNames.UI_Notification,
    targets.length > 0
      ? "Jump: click a highlighted landing square to leap over the adjacent square."
      : "No adjacent player to Jump over."
  );
}

export function selectStep(
  c: GameplayInteractionController,
  data: { stepId: string }
): void {
  // Validate step exists in current sequence
  const stepExists = c.actionSteps.some((s) => s.id === data.stepId);
  if (!stepExists) {
    console.warn("Invalid step selected:", data.stepId);
    return;
  }
  if (data.stepId !== c.currentStepId) c.dropAim();

  if (data.stepId === "standup" && c.selectedPlayerId) {
    standUpStep(c, c.selectedPlayerId);
    return;
  }
  if (data.stepId === "jump" && c.selectedPlayerId) {
    jumpStep(c, c.selectedPlayerId);
    return;
  }

  // Any other step ends Jump targeting.
  c.jumpTargeting = false;
  c.currentStepId = data.stepId;
  c.eventBus.emit(GameEventNames.UI_UpdateActionSteps, {
    steps: c.actionSteps,
    currentStepId: c.currentStepId,
  });
  console.log(`Switched action step to: ${data.stepId}`);

  // 1. Refresh static visuals (range overlay, tackle zones) for the new step
  if (c.selectedPlayerId) {
    refreshPlayerVisualization(c, c.selectedPlayerId);
  }

  // 2. Refresh dynamic visuals (cursor, path, pass lines)
  if (c.lastHoverGrid) {
    c.onSquareHovered(c.lastHoverGrid.x, c.lastHoverGrid.y);
  } else {
    // Clear dynamic visuals if no hover (path, cursor)
    // Static visuals already handled above
    c.pitch.clearPassVisualization();
    c.pitch.clearPath();
  }
}

export function cancelAction(c: GameplayInteractionController): void {
  if (!c.selectedPlayerId) return;

  // If we have already moved, we cannot fully cancel the action to select another player
  // effectively, we can only "End Activation" or continue.
  // BUT the requirement says: "if the player misclicked it they should be able to exit by pressing the back button"
  // AND "if a player moves then they can no longer go back to the context menu"

  if (c.hasMovedInAction) {
    // If moved, Back might just deselect current step or do nothing?
    // The requirement says "can no longer go back to the context menu".
    // So maybe Back is disabled in UI?
    // If UI emits this, let's treat it as deselecting ONLY if we haven't moved?
    console.warn("Cannot cancel action after moving");
    return;
  }

  // Determine what to go back to.
  // If we are in an Action (like Pass) and haven't moved, "Back" should probably cancel the Action Mode
  // and return to "Just Selected" state (Action Menu open).

  if (!c.gameService.cancelAction(c.selectedPlayerId)) {
    c.eventBus.emit(
      GameEventNames.UI_Notification,
      "This Action is already committed and cannot be cancelled."
    );
    return;
  }

  c.dropAim();
  // Reset Action Mode but keep player selected
  c.currentActionMode = null;
  c.currentBlockReplacement = null;
  c.currentStepId = null;
  c.actionSteps = [];
  c.pitch.clearPassVisualization();

  // Record the interaction "moment" this optimistic reset happened at —
  // an online guest's cancelAction() always reports success immediately,
  // so a late rejection needs a way to tell whether anything local has
  // moved on since (see onNetworkCommandRejected).
  c.interactionSeq++;
  c.pendingCancelSeqByPlayer.set(c.selectedPlayerId, c.interactionSeq);

  // Notify UI to show default menu again
  // We do this by emitting PlayerSelected again (which resets menu in PlayerActionMenu)
  const player = c.gameService.getPlayerById(c.selectedPlayerId);
  if (player) {
    c.eventBus.emit(GameEventNames.PlayerSelected, { player });

    // Also need to refresh visuals (ranges might have been hidden/changed)
    refreshPlayerVisualization(c, c.selectedPlayerId);
  }
}

/**
 * Online guest only. NetworkedGameService's declareAction()/cancelAction()
 * answer optimistically — "true" before the host has even seen the
 * command — so onActionSelected/onCancelAction above already advanced
 * currentActionMode/actionSteps/currentStepId by the time the real
 * verdict arrives. When that verdict is a rejection, this local
 * step-machine is now describing an action the host never accepted:
 * left alone, every further click (e.g. an attempted Block) keeps
 * bouncing off a step the host has no matching declaration for
 * (repro: a Bloodlust-gated declaration commits host-side, a stale
 * cancel is rejected, the guest UI resets anyway, the redeclare that
 * follows is rejected too, yet the UI had already switched to the
 * "block" step — every subsequent block attempt then loops forever on
 * "block-not-declared"). Deselecting forces a clean reselect against the
 * replica, which the same response already corrected via its snapshot.
 *
 * Both branches below must independently confirm the rejection still
 * describes THIS controller's current optimistic state before touching
 * anything — a late rejection for a command the coach has since moved
 * past (declared something else, cancelled again, deselected) must be a
 * no-op, or reconciliation would itself become a source of desync.
 */
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
    // The markers went when the answer was sent; a refused answer leaves
    // the bite open, so mark its Thralls again for the coach to retry
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
  // Reselect so the menu rebuilds immediately against the now-corrected
  // replica, rather than leaving the coach staring at an empty board.
  c.selectPlayer(playerId);
}

export function endActivation(c: GameplayInteractionController): void {
  const playerId = c.selectedPlayerId;
  if (!playerId) return;
  const before = c.gameService.getState();
  const teamId = before.activeTeamId;
  const turn = before.turn;
  c.gameService.finishActivation(playerId);
  // Charge!, Razzle-Dazzle and forced continuations already chose what comes next.
  if (c.selectedPlayerId !== playerId) return;
  c.deselectPlayer();
  const state = c.gameService.getState();
  if (
    teamId &&
    state.activeTeamId === teamId &&
    state.turn === turn &&
    (!state.activePlayer || c.gameService.runsCommandsLater) &&
    state.phase === GamePhase.PLAY
  ) {
    c.eventBus.emit(GameEventNames.Camera_ChooseNextPlayer, {
      teamId,
      playerId,
    });
  }
}

/** Whether this board's coach controls the player, online. */
function controlsPlayer(teamId: string): boolean {
  const online = getActiveOnlineMatch();
  return !online || online.myTeamId === teamId;
}

/**
 * A Blitz block that left movement re-enters the move: re-select the
 * blitzer where the follow-up left them, with the rest of their MA (and
 * Rush) available. Their one Block is spent, so only Move remains.
 */
export function resumeBlitzMove(
  c: GameplayInteractionController,
  playerId: string
): void {
  const player = c.gameService.getPlayerById(playerId);
  if (!player || c.gameService.hasPlayerActed(playerId)) return;
  // Online, only the board of the coach who controls the blitzer
  if (!controlsPlayer(player.teamId)) return;
  c.selectedPlayerId = playerId;
  c.currentActionMode = "blitz";
  c.currentStepId = "move";
  c.hasMovedInAction = true;
  c.clearWaypoints();
  c.pitch.clearPath();
  c.scene.highlightPlayer(playerId);
  c.eventBus.emit(GameEventNames.PlayerSelected, { player });
  c.eventBus.emit(GameEventNames.UI_UpdateActionSteps, {
    steps: [{ id: "move", label: "Move" }],
    currentStepId: "move",
  });
  refreshPlayerVisualization(c, playerId);
}

/**
 * A Ball & Chain square has resolved with squares left: pick the Fanatic
 * back up, wherever the square left it, for the coach's next facing.
 */
export function resumeBallAndChain(
  c: GameplayInteractionController,
  playerId: string
): void {
  const player = c.gameService.getPlayerById(playerId);
  if (!player || c.gameService.hasPlayerActed(playerId)) return;
  if (!controlsPlayer(player.teamId)) return;
  c.selectedPlayerId = playerId;
  c.currentActionMode = "ballAndChain";
  c.currentStepId = "swing";
  c.hasMovedInAction = true;
  c.scene.highlightPlayer(playerId);
  c.eventBus.emit(GameEventNames.PlayerSelected, { player });
  c.eventBus.emit(GameEventNames.UI_UpdateActionSteps, {
    steps: [{ id: "swing", label: "Swing (pick a direction)" }],
    currentStepId: "swing",
  });
  c.eventBus.emit(GameEventNames.PlayerMovedInAction, { playerId });
  refreshPlayerVisualization(c, playerId);
}

/** The negatrait rolls a fresh declaration of `action` would make now. */
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

/**
 * Bone Head, Bloodlust and the other negatraits roll the moment an action
 * is declared, and the roll binds the player to it. Ask first, so a coach
 * who only meant to measure a route can back out with nothing spent.
 * Null when there is nothing to ask, so the declaration goes ahead in
 * the same tick.
 */
export function askGates(
  c: GameplayInteractionController,
  playerId: string,
  action: ActionType
): Promise<boolean> | null {
  const gates = pendingGates(c, playerId, action);
  const player = c.gameService.getPlayerById(playerId);
  if (gates.length === 0 || !player) return null;
  const asked = c.confirmations.ask("gate", gateRequest(player, gates));
  // A coach who picked someone else meanwhile meant that one instead
  return asked.then(
    (confirmed) => confirmed && c.selectedPlayerId === playerId
  );
}

/**
 * Choosing another of the acting team's players ends the one who was
 * acting, as in the rules: a declaration with nothing done yet is
 * released (the team's allowance comes back), anything further ends
 * that player's activation. Looking at an opponent changes nothing.
 */
function releasePreviousPlayer(
  c: GameplayInteractionController,
  playerId: string,
  active: GameState["activePlayer"],
  ownTeamsTurn: boolean
): void {
  if (active && active.id !== playerId && ownTeamsTurn) {
    if (active.committed) c.gameService.finishActivation(active.id);
    else c.gameService.cancelAction(active.id);
  } else if (!active && c.selectedPlayerId && c.selectedPlayerId !== playerId) {
    // Movement spent outside a declaration must not leave a turn dangling
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
  releasePreviousPlayer(c, playerId, state.activePlayer, ownTeamsTurn);

  c.deselectPlayer();
  c.selectedPlayerId = playerId;

  // Visual highlight
  c.scene.highlightPlayer(playerId);

  // UI Selection Event
  c.eventBus.emit(GameEventNames.PlayerSelected, { player });

  // The player still mid-action (selected again after clicking away, or
  // after a reload): carry on with that action where it was left
  const resumed = c.gameService.getState().activePlayer;
  if (
    resumed?.id === playerId &&
    resumed.action &&
    !resumed.razzleDazzle?.awaitingSecond &&
    ownTeamsTurn &&
    !c.gameService.hasPlayerActed(playerId)
  ) {
    enterActionMode(
      c,
      playerId,
      resumed.action as ActionType,
      resumed.blockReplacement ?? null
    );
    c.hasMovedInAction = c.gameService.getMovementUsed(playerId) > 0;
    return;
  }

  refreshPlayerVisualization(c, playerId);
}

/**
 * After a reload or a resync the engine may hold one of this coach's
 * players mid-action while the board has nothing selected, so clicks on
 * the pitch did nothing. Select that player again and resume its action.
 */
export function resumeActivePlayer(c: GameplayInteractionController): void {
  const active = c.gameService.getState().activePlayer;
  const player = active ? c.gameService.getPlayerById(active.id) : null;
  if (!active?.action || !player) return;
  if (!controlsPlayer(player.teamId)) return;
  c.selectPlayer(active.id);
}
