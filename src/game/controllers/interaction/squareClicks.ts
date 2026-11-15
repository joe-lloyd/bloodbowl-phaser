/**
 * Pitch clicks that no aiming step claims: the Touchback, a Jump, the
 * Blitz's Block, and the plain rules of the pitch, where clicking a player
 * selects or blocks them and clicking a square plots a move.
 *
 * Every await sits where onSquareClicked had it before the split. With no
 * negatrait to ask about, a Block or a Move is declared in the same tick
 * as the click, as before.
 */

import { GameEventNames } from "@/types/events";
import { GameState } from "@/types/GameState";
import { Player, PlayerStatus } from "@/types/Player";
import {
  BlockReplacement,
  BLOCK_REPLACEMENT_DEFINITIONS,
} from "@/types/BlockReplacement";
import { legalBlockReplacementTargets } from "../../rules/blockReplacements";
import type { GameplayInteractionController } from "../GameplayInteractionController";
import { attack, SquareClick, stepClickFor } from "./stepClicks";
import { computeJumpTargets } from "./previews";
import { addWaypoint, executeMove, refreshPlayerVisualization } from "./routes";
import { askGates, enterActionMode } from "./actionModes";

// TOUCHBACK: the receiving coach must hand the ball to one of their
// players before anything else happens
export function clickTouchback(
  c: GameplayInteractionController,
  playerAtSquare: Player | null
): void {
  if (playerAtSquare && c.gameService.awardTouchback(playerAtSquare.id)) {
    return;
  }
  c.eventBus.emit(
    GameEventNames.UI_Notification,
    "Touchback: select one of your standing players to take the ball."
  );
}

/**
 * Resolve a Jump-targeting click: leap over the adjacent player into the
 * clicked push-back square. A Jump does not end the Move — if the player is
 * still Standing with an activation left they stay selected and can move or
 * Jump again (the Move step is never marked complete).
 */
export async function handleJumpClick(
  c: GameplayInteractionController,
  playerId: string,
  x: number,
  y: number
): Promise<void> {
  const player = c.gameService.getPlayerById(playerId);
  if (!player?.gridPosition) return;
  const landing = computeJumpTargets(c, player).some(
    (t) => t.dest.x === x && t.dest.y === y
  );
  if (!landing) {
    c.eventBus.emit(
      GameEventNames.UI_Notification,
      "Click one of the highlighted landing squares to Jump."
    );
    return;
  }
  c.jumpTargeting = false;
  c.pitch.clearPath();
  try {
    await c.gameService.jumpPlayer(player.id, { x, y });
  } catch (err) {
    c.eventBus.emit(GameEventNames.UI_Notification, `Cannot Jump: ${err}`);
  }
  const after = c.gameService.getPlayerById(player.id);
  if (
    after?.status === PlayerStatus.ACTIVE &&
    c.gameService.canActivate(player.id)
  ) {
    // Keep the player selected and in Move mode so they can keep moving or
    // Jump again; refresh the movement overlay for the new square.
    refreshPlayerVisualization(c, player.id);
  } else {
    c.deselectPlayer();
  }
}

function isDownedOpponent(
  c: GameplayInteractionController,
  target: Player
): boolean {
  const selected = c.selectedPlayerId
    ? c.gameService.getPlayerById(c.selectedPlayerId)
    : undefined;
  return (
    !!selected &&
    target.teamId !== selected.teamId &&
    (target.status === PlayerStatus.PRONE ||
      target.status === PlayerStatus.STUNNED)
  );
}

/**
 * A downed opponent can never be Blocked, only Fouled. A click on one
 * declares the Foul in place of whatever is still uncommitted and hands
 * the click to the Foul step, whose confirm lets the coach back out.
 */
async function foulInsteadOfBlock(
  c: GameplayInteractionController,
  playerId: string,
  x: number,
  y: number
): Promise<void> {
  const asked = askGates(c, playerId, "foul");
  if (asked && !(await asked)) return;
  if (!c.gameService.declareAction(playerId, "foul")) {
    c.eventBus.emit(
      GameEventNames.UI_Notification,
      "A downed player can only be Fouled, and this player cannot Foul now."
    );
    return;
  }
  enterActionMode(c, playerId, "foul", null);
  await c.onSquareClicked(x, y);
}

// BLITZ Execution (Block Step). An empty square, or the blitzer, is left
// to the plain pitch rules.
function clickBlitzBlock(
  c: GameplayInteractionController,
  click: SquareClick
): Promise<void> | void {
  const { x, y, player: playerAtSquare } = click;
  if (
    !c.selectedPlayerId ||
    !playerAtSquare ||
    playerAtSquare.id === c.selectedPlayerId
  ) {
    return clickPitch(c, click);
  }
  const blitzer = c.gameService.getPlayerById(c.selectedPlayerId);
  const inReach =
    !!blitzer?.gridPosition &&
    Math.max(
      Math.abs(blitzer.gridPosition.x - x),
      Math.abs(blitzer.gridPosition.y - y)
    ) === 1;
  if (inReach && isDownedOpponent(c, playerAtSquare)) {
    return foulInsteadOfBlock(c, c.selectedPlayerId, x, y);
  }
  // Initiate Block
  c.isBusy = true;
  // Don't wait for preview? Preview is sync usually?
  // Actually previewBlock just emits an event for UI to show dialog.
  // It doesn't need a lock usually, but deselectPlayer does cleanup.
  c.gameService.previewBlock(c.selectedPlayerId, playerAtSquare.id);

  c.deselectPlayer();
  c.isBusy = false;
}

/**
 * The selected player when they may Block the clicked opponent from where
 * they stand: their team's turn, free to act, and next to them.
 */
function adjacentBlocker(
  c: GameplayInteractionController,
  selectedPlayer: Player | undefined,
  target: Player,
  state: GameState,
  { x, y }: { x: number; y: number }
): Player | null {
  if (
    !selectedPlayer ||
    state.activeTeamId !== selectedPlayer.teamId ||
    !c.gameService.canActivate(selectedPlayer.id) ||
    selectedPlayer.teamId === target.teamId
  ) {
    return null;
  }
  // Check Adjacency
  const dx = Math.abs((selectedPlayer.gridPosition?.x || 0) - x);
  const dy = Math.abs((selectedPlayer.gridPosition?.y || 0) - y);
  return dx <= 1 && dy <= 1 ? selectedPlayer : null;
}

/**
 * This player's own declaration, read from the authoritative state (not the
 * local step), so a re-selected player, a guest and the host all take the
 * same path. A Razzle-Dazzle player between Actions has none.
 */
function declarationOf(
  state: GameState,
  playerId: string
): { action?: string | null; replacement?: BlockReplacement } {
  const active = state.activePlayer;
  if (active?.id !== playerId || active.razzleDazzle?.awaitingSecond) {
    return {};
  }
  return {
    action: active.action,
    replacement: active.blockReplacementUsed
      ? undefined
      : active.blockReplacement,
  };
}

/**
 * A declared, unspent block-replacing attack is what a target click
 * resolves — never a Block.
 */
async function attackInsteadOfBlock(
  c: GameplayInteractionController,
  attacker: Player,
  target: Player,
  replacement: BlockReplacement
): Promise<void> {
  const label = BLOCK_REPLACEMENT_DEFINITIONS[replacement].label;
  const legalTarget =
    legalBlockReplacementTargets(attacker, [target], replacement).length > 0;
  if (!legalTarget) {
    // Refuse by name: downgrading to a Block would spend the
    // one attack on something the coach did not choose. The
    // declaration and the remaining movement are untouched.
    c.eventBus.emit(
      GameEventNames.UI_Notification,
      `${label} cannot target ${target.playerName} — keep moving or end the activation.`
    );
    return;
  }
  c.isBusy = true;
  try {
    await attack(c.gameService, replacement, attacker.id, target.id);
  } finally {
    c.isBusy = false;
    c.deselectPlayer();
  }
}

/** IT'S A BLOCK: a click on an adjacent opponent, declared if need be. */
async function blockFromClick(
  c: GameplayInteractionController,
  blocker: Player,
  target: Player,
  state: GameState,
  { x, y }: { x: number; y: number }
): Promise<void> {
  if (isDownedOpponent(c, target)) {
    await foulInsteadOfBlock(c, blocker.id, x, y);
    return;
  }

  // Implicit Action Declaration
  // Only check current action if it's for THIS player
  const declared = declarationOf(state, blocker.id);
  const currentAction = declared.action;

  // A Blitz allows only one Block; after it, further clicks move.
  if (c.gameService.hasUsedBlitzBlock(blocker.id)) {
    c.eventBus.emit(
      GameEventNames.UI_Notification,
      "This Blitz has already used its Block — keep moving."
    );
    return;
  }

  if (declared.replacement) {
    return attackInsteadOfBlock(c, blocker, target, declared.replacement);
  }

  if (!currentAction) {
    const asked = askGates(c, blocker.id, "block");
    if (asked && !(await asked)) return;
    // If no action declared for this player, implicitly declare
    // BLOCK — refused e.g. for a prone/stunned blocker
    if (!c.gameService.declareAction(blocker.id, "block")) {
      c.eventBus.emit(
        GameEventNames.UI_Notification,
        "This player cannot Block (down players must Blitz)."
      );
      return;
    }
  } else if (currentAction === "move") {
    // Cannot block if Move declared (unless Blitz, handled below)
    c.eventBus.emit(
      GameEventNames.UI_Notification,
      "Cannot Block during Move action (need Blitz)"
    );
    return;
  }

  // Deselect player to clear movement path/highlights
  c.deselectPlayer();
  // Trigger Block Preview
  c.gameService.previewBlock(blocker.id, target.id);
}

// Clicking ANOTHER player
function clickOtherPlayer(
  c: GameplayInteractionController,
  playerAtSquare: Player,
  click: SquareClick
): Promise<void> | void {
  // BLOCK CHECK — only for modes that actually mean to Block: nothing
  // declared (the implicit shortcut), a declared standalone Block, or a
  // Blitz still in its move. Every other action mode must have claimed
  // this click already; letting them reach here is how a declared Foul
  // (and any future targeted action) decayed into a block dice dialog.
  const mayBlockFromHere =
    c.currentActionMode === null ||
    c.currentActionMode === "block" ||
    c.currentActionMode === "blitz";

  if (c.selectedPlayerId && mayBlockFromHere) {
    const selectedPlayer = c.gameService.getPlayerById(c.selectedPlayerId);
    const state = c.gameService.getState();
    const blocker = adjacentBlocker(
      c,
      selectedPlayer,
      playerAtSquare,
      state,
      click
    );
    if (blocker)
      return blockFromClick(c, blocker, playerAtSquare, state, click);
  }

  // If not a block, select them (inspection) — but never while a
  // targeted action is mid-declaration. Reaching here means the click
  // was not a valid target for that action; abandoning the action and
  // reselecting the clicked player is never what the coach meant.
  if (
    c.currentActionMode !== null &&
    !mayBlockFromHere &&
    c.currentActionMode !== "move"
  ) {
    console.warn(
      `[Interaction] Clicked player during ${c.currentActionMode} mode; ignoring to prevent selection change.`
    );
    c.eventBus.emit(
      GameEventNames.UI_Notification,
      `Finish your ${c.currentActionMode} Action first!`
    );
    return;
  }

  c.selectPlayer(playerAtSquare.id);
}

// Empty Square Click: plot a route, or walk it when the click lands on
// the last waypoint (or the player's own square with none).
async function clickEmptySquare(
  c: GameplayInteractionController,
  selectedId: string,
  x: number,
  y: number
): Promise<void> {
  const player = c.gameService.getPlayerById(selectedId);
  const state = c.gameService.getState();

  // Only allow movement planning if active team and player can activate
  if (
    !player ||
    state.activeTeamId !== player.teamId ||
    !c.gameService.canActivate(player.id)
  ) {
    c.deselectPlayer();
    return;
  }
  // Implicit Action Declaration
  // Only check current action if it's for THIS player
  const currentAction =
    state.activePlayer?.id === player.id
      ? state.activePlayer?.action
      : undefined;

  const asked = currentAction ? null : askGates(c, player.id, "move");
  if (asked && !(await asked)) return;
  if (!c.declareMoveIfNone(player.id, currentAction)) return;

  // Check if clicking the LAST added waypoint (or current pos if none) -> CONFIRM
  const lastPos =
    c.waypoints.length > 0
      ? c.waypoints[c.waypoints.length - 1]
      : player.gridPosition;

  if (lastPos && lastPos.x === x && lastPos.y === y) {
    // CONFIRM MOVE
    executeMove(c);
  } else {
    // ADD WAYPOINT
    addWaypoint(c, x, y);
  }
}

// PLAY PHASE: a player is selected or blocked, an empty square plots a move.
function clickPitch(
  c: GameplayInteractionController,
  click: SquareClick
): Promise<void> | void {
  const playerAtSquare = click.player;
  if (playerAtSquare) {
    // Clicking SELF does nothing
    if (playerAtSquare.id !== c.selectedPlayerId) {
      return clickOtherPlayer(c, playerAtSquare, click);
    }
  } else if (c.selectedPlayerId) {
    return clickEmptySquare(c, c.selectedPlayerId, click.x, click.y);
  } else {
    c.deselectPlayer(); // Clicking empty space with no selection
  }
}

/** A pitch click in play, once the bite, spell, push and Jump have passed. */
export function clickInPlay(
  c: GameplayInteractionController,
  click: SquareClick
): Promise<void> | void {
  // PASS Execution (if in pass aiming mode)
  if (c.currentActionMode === "pass") {
    console.log(
      `[Interaction] onSquareClicked: Pass Mode Detected. Step: ${c.currentStepId}, Selected: ${c.selectedPlayerId}`
    );
  }
  const stepClick = stepClickFor(c, click);
  if (stepClick) return stepClick(c, click);
  if (
    c.currentActionMode === "blitz" &&
    c.currentStepId === "block" &&
    c.selectedPlayerId
  ) {
    return clickBlitzBlock(c, click);
  }
  return clickPitch(c, click);
}
