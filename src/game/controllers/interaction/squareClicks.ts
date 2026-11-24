import { isOwnActor } from "./players";
import { adjacentTo, withinOneSquare } from "./squares";
import { GameEventNames } from "@/types/events";
import { type GameState } from "@/types/GameState";
import { type Player, PlayerStatus } from "@/types/Player";
import {
  type BlockReplacement,
  BLOCK_REPLACEMENT_DEFINITIONS,
} from "@/types/BlockReplacement";
import { legalBlockReplacementTargets } from "../../rules/blockReplacements";
import type { GameplayInteractionController } from "../GameplayInteractionController";
import { attack, type SquareClick, stepClickFor } from "./stepClicks";
import { plannedJumpTargets, showSteps } from "./movement";
import { addWaypoint, drawCurrentPath, refreshPlayerVisualization } from "./routes";
import { askGates, defersGates, enterActionMode, selectAction } from "./actionModes";
import { PLANNED_MOVE, finishKindAt, plannedActionFor } from "./plan";
import { goPlan, planFinishAt } from "./planRun";

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

export function planJumpAt(
  c: GameplayInteractionController,
  square: { x: number; y: number }
): void {
  const player = c.selectedPlayerId
    ? c.gameService.getPlayerById(c.selectedPlayerId)
    : undefined;
  if (!player) return;
  const landing = plannedJumpTargets(c, player).find(
    ({ dest }) => dest.x === square.x && dest.y === square.y
  );
  if (!landing) {
    c.eventBus.emit(
      GameEventNames.UI_Notification,
      "Click one of the highlighted landing squares to Jump."
    );
    return;
  }
  c.jumpTargeting = false;
  c.waypoints.push({ ...landing.dest, over: landing.over });
  showSteps(c);
  drawCurrentPath(c);
  refreshPlayerVisualization(c, player.id);
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

async function foulInsteadOfBlock(
{ c,playerId,x,y }: { c: GameplayInteractionController; playerId: string; x: number; y: number; }): Promise<void> {
  if (c.undeclared) {
    c.clearWaypoints();
    c.dropFinish();
    c.pitch.clearPath();
    await selectAction(c, { playerId, action: "foul" });
    await c.onSquareClicked(x, y);
    return;
  }
  const asked = askGates(c, playerId, "foul");
  if (asked && !(await asked)) return;
  if (!c.gameService.declareAction({ playerId: playerId, action: "foul" })) {
    c.eventBus.emit(
      GameEventNames.UI_Notification,
      "A downed player can only be Fouled, and this player cannot Foul now."
    );
    return;
  }
  enterActionMode({ c,playerId,action: "foul",blockReplacement: null });
  await c.onSquareClicked(x, y);
}

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
  if (adjacentTo(blitzer?.gridPosition, { x, y }) && isDownedOpponent(c, playerAtSquare)) {
    return foulInsteadOfBlock({ c,playerId: c.selectedPlayerId,x,y });
  }
  return clickPitch(c, click);
}

function adjacentBlocker(
  { c, selectedPlayer, target, state, x, y }: { c: GameplayInteractionController; selectedPlayer: Player | undefined; target: Player; state: GameState; x: number; y: number }
): Player | null {
  if (!isOwnActor(c, selectedPlayer, state.activeTeamId) || selectedPlayer.teamId === target.teamId) return null;
  return withinOneSquare(selectedPlayer.gridPosition, { x, y }) ? selectedPlayer : null;
}

function declarationOf(
  state: GameState,
  playerId: string
): { action?: string | null; replacement?: BlockReplacement } {
  const active = state.activePlayer;
  if (active?.id !== playerId || active.razzleDazzle?.awaitingSecond) {
    return {};
  }
  const replacement = active.blockReplacementUsed ? undefined : active.blockReplacement;
  return { action: active.action, ...(replacement === undefined ? {} : { replacement }) };
}

async function attackInsteadOfBlock(
{ c,attacker,target,replacement }: { c: GameplayInteractionController; attacker: Player; target: Player; replacement: BlockReplacement; }): Promise<void> {
  const label = BLOCK_REPLACEMENT_DEFINITIONS[replacement].label;
  const legalTarget =
    legalBlockReplacementTargets(attacker, [target], replacement).length > 0;
  if (!legalTarget) {
    c.eventBus.emit(
      GameEventNames.UI_Notification,
      `${label} cannot target ${target.playerName} — keep moving or end the activation.`
    );
    return;
  }
  c.isBusy = true;
  try {
    await attack({ gameService: c.gameService,kind: replacement,attackerId: attacker.id,targetId: target.id });
  } finally {
    c.isBusy = false;
    c.deselectPlayer();
  }
}

async function blockFromClick(
  { c, blocker, target, state, x, y }: { c: GameplayInteractionController; blocker: Player; target: Player; state: GameState; x: number; y: number }
): Promise<void> {
  if (isDownedOpponent(c, target)) {
    await foulInsteadOfBlock({ c,playerId: blocker.id,x,y });
    return;
  }

  const declared = declarationOf(state, blocker.id);
  const currentAction = declared.action;

  if (c.gameService.hasUsedBlitzBlock(blocker.id)) {
    c.eventBus.emit(
      GameEventNames.UI_Notification,
      "This Blitz has already used its Block — keep moving."
    );
    return;
  }

  if (declared.replacement) {
    return attackInsteadOfBlock({ c,attacker: blocker,target,replacement: declared.replacement });
  }

  if (!currentAction) {
    const asked = askGates(c, blocker.id, "block");
    if (asked && !(await asked)) return;

    if (!c.gameService.declareAction({ playerId: blocker.id, action: "block" })) {
      c.eventBus.emit(
        GameEventNames.UI_Notification,
        "This player cannot Block (down players must Blitz)."
      );
      return;
    }
  } else if (currentAction === "move") {
    c.eventBus.emit(
      GameEventNames.UI_Notification,
      "Cannot Block during Move action (need Blitz)"
    );
    return;
  }

  c.deselectPlayer();

  c.gameService.previewBlock(blocker.id, target.id);
}

function clickOtherPlayer(
  c: GameplayInteractionController,
  playerAtSquare: Player,
  click: SquareClick
): Promise<void> | void {
  const mayBlockFromHere =
    c.currentActionMode === null ||
    c.currentActionMode === "block" ||
    c.currentActionMode === "blitz";

  if (c.selectedPlayerId && mayBlockFromHere) {
    const selectedPlayer = c.gameService.getPlayerById(c.selectedPlayerId);
    const state = c.gameService.getState();
    const blocker = adjacentBlocker({ c: c, selectedPlayer: selectedPlayer, target: playerAtSquare, state: state, ...click }
    );
    if (blocker)
      return blockFromClick({ c: c, blocker: blocker, target: playerAtSquare, state: state, ...click });
  }

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

function readyToRoute(c: GameplayInteractionController, state: GameState, playerId: string): boolean | Promise<boolean> {
  const currentAction = plannedActionFor(c, state, playerId);
  if (!currentAction && defersGates(c, playerId, "move")) {
    c.undeclared = PLANNED_MOVE;
    return true;
  }
  const asked = currentAction ? null : askGates(c, playerId, "move");
  if (!asked) return c.declareMoveIfNone(playerId, currentAction);
  return asked.then((ok) => ok && c.declareMoveIfNone(playerId, currentAction));
}

async function clickEmptySquare(
{ c,selectedId,x,y }: { c: GameplayInteractionController; selectedId: string; x: number; y: number; }): Promise<void> {
  const player = c.gameService.getPlayerById(selectedId);
  const state = c.gameService.getState();

  if (
    !isOwnActor(c, player, state.activeTeamId)
  ) {
    c.deselectPlayer();
    return;
  }

  const ready = readyToRoute(c, state, player.id);
  if (ready instanceof Promise ? !(await ready) : !ready) return;

  const lastPos = c.waypoints.at(-1) ?? player.gridPosition;

  if (lastPos?.x === x && lastPos.y === y) {
    await goPlan(c);
  } else {
    addWaypoint(c, x, y);
  }
}

function clickPitch(
  c: GameplayInteractionController,
  click: SquareClick
): Promise<void> | void {
  const playerAtSquare = click.player;
  if (playerAtSquare) {
    if (playerAtSquare.id !== c.selectedPlayerId) {
      return clickOtherPlayer(c, playerAtSquare, click);
    }
  } else if (c.selectedPlayerId) {
    return clickEmptySquare({ c,selectedId: c.selectedPlayerId,x: click.x,y: click.y });
  } else {
    c.deselectPlayer();
  }
}

export function clickInPlay(
  c: GameplayInteractionController,
  click: SquareClick
): Promise<void> | void {
  if (c.currentActionMode === "pass") {
    console.log(
      `[Interaction] onSquareClicked: Pass Mode Detected. Step: ${String(c.currentStepId)}, Selected: ${String(c.selectedPlayerId)}`
    );
  }
  const finish = finishKindAt(c, click);
  if (finish) return planFinishAt(c, finish, click);
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
