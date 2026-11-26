import { kickoffTurnOf } from "../../kickoff/kickRecord";
import { adjacentSquares } from "./squares";
import { GameEventNames } from "@/types/events";
import { SubPhase } from "@/types/GameState";
import { type Player } from "@/types/Player";
import { GameConfig, isKickingTeamTerritory } from "@/config/GameConfig";
import { GamePhase } from "@/types/GameState";
import { getActiveOnlineMatch } from "@/network/OnlineMatch";
import type { KickoffEventStepState } from "../../kickoff/KickoffEventManager";
import { KickoffEvent, isPickableKickoffPlayer } from "../../kickoff/kickoffEvents";
import type { GameplayInteractionController } from "../GameplayInteractionController";
import { isStandableSquare } from "../../rules/pitchSquares";

function pickRefusal(step: KickoffEventStepState, player: Player): string {
  return step.selectedPlayerIds.length >= step.selectionLimit
    ? `${step.event}: ${String(step.selectionLimit)} picked already. Click a picked player to drop them.`
    : `${step.event}: ${player.playerName} cannot be picked.`;
}

function toggleEventPick(
  c: GameplayInteractionController,
  step: KickoffEventStepState,
  player: Player
): void {
  if (!c.gameService.selectKickoffEventPlayer(player.id)) {
    c.eventBus.emit(GameEventNames.UI_Notification, pickRefusal(step, player));
    return;
  }
  const landing = step.landingSquare;
  if (step.event === KickoffEvent.HIGH_KICK && landing) {
    c.gameService.placeKickoffEventPlayer(player.id, landing.x, landing.y);
  }
  c.selectedPlayerId = null;
  c.eventBus.emit(GameEventNames.PlayerSelected, { player: null });
}

function waitingPlayerIds(step: KickoffEventStepState): string[] {
  return step.selectedPlayerIds.filter(
    (id) => !step.movedPlayerIds.includes(id)
  );
}

function stepTo(
  c: GameplayInteractionController,
  step: KickoffEventStepState,
  { x, y }: { x: number; y: number }
): void {
  const mover = c.selectedPlayerId;
  if (mover && c.gameService.moveKickoffEventPlayer(mover, x, y)) {
    c.deselectPlayer();
    return;
  }
  c.eventBus.emit(
    GameEventNames.UI_Notification,
    mover
      ? `${step.event}: choose one adjacent empty pitch square.`
      : `${step.event}: click one of the picked players first.`
  );
}

function selectStepper(
  c: GameplayInteractionController,
  player: Player
): void {
  if (c.selectedPlayerId === player.id) return;
  c.deselectPlayer();
  c.selectedPlayerId = player.id;
  c.eventBus.emit(GameEventNames.PlayerSelected, { player });
}

interface EventClick {
  c: GameplayInteractionController;
  step: KickoffEventStepState;
  x: number;
  y: number;
  player: Player | null;
}

function clickOneSquareTurn({ c, step, x, y, player }: EventClick): void {
  if (player && waitingPlayerIds(step).includes(player.id)) {
    selectStepper(c, player);
  } else {
    stepTo(c, step, { x, y });
  }
}

function clickEventStep(click: EventClick): void {
  const { c, step, player } = click;
  if (getActiveOnlineMatch()?.mayAct() === false) return;
  if (step.stage === "play") {
    clickOneSquareTurn(click);
  } else if (player?.teamId === step.teamId) {
    toggleEventPick(c, step, player);
  }
}

export function playsKickoffActions(
  c: GameplayInteractionController
): boolean {
  return kickoffTurnOf(c.gameService.getState())?.play.kind === "actions";
}

function selectKicker(c: GameplayInteractionController, kicker: Player): void {
  if (c.selectedPlayerId && c.selectedPlayerId !== kicker.id) {
    c.scene.unhighlightPlayer(c.selectedPlayerId);
  }

  c.selectedPlayerId = kicker.id;

  c.pitch.clearHighlights();
  c.scene.highlightPlayer(kicker.id);
  c.gameService.selectKicker(kicker.id);
  c.eventBus.emit(
    GameEventNames.UI_Notification,
    "Kicker Selected! Now choose target."
  );
}

function clickKickAim(
{ c,x,y,playerAtSquare }: { c: GameplayInteractionController; x: number; y: number; playerAtSquare: Player|null; }): void {
  if (playerAtSquare?.teamId === c.scene.kickingTeam.id) {
    selectKicker(c, playerAtSquare);
    return;
  }

  const isTeam1Kicking = c.scene.kickingTeam.id === c.scene.team1.id;
  const isOpponentHalf =
    !isKickingTeamTerritory(x, isTeam1Kicking) && isStandableSquare({ x, y });

  if (!isOpponentHalf) {
    if (c.selectedPlayerId) {
      c.eventBus.emit(
        GameEventNames.UI_Notification,
        "Kick to opponent's half!"
      );
    }
    return;
  }

  if (c.selectedPlayerId) {
    c.isBusy = true;
    try {
      void c.gameService.kickBall({ isTeam1Kicking: isTeam1Kicking, playerId: c.selectedPlayerId, targetX: x, targetY: y });
      c.selectedPlayerId = null;
    } finally {
      c.isBusy = false;
    }
  } else {
    c.eventBus.emit(GameEventNames.UI_Notification, "Select a Kicker first!");
  }
}

export function handleKickoffClick(
{ c,x,y,playerAtSquare }: { c: GameplayInteractionController; x: number; y: number; playerAtSquare: Player|null; }): void {
  const eventStep = c.gameService.getKickoffEventStep();
  if (eventStep) {
    clickEventStep({ c, step: eventStep, x, y, player: playerAtSquare });
    return;
  }
  if (c.gameService.getSubPhase() === SubPhase.ROLL_KICKOFF) {
    clickKickAim({ c,x,y,playerAtSquare });
  }
}

function eligibleKickoffPlayers(
  step: KickoffEventStepState,
  players: Player[],
  opponents: Player[]
): Player[] {
  if (step.stage === "play") return [];
  return players.filter((player) =>
    isPickableKickoffPlayer(step.event, player, opponents)
  );
}

function oneSquareMoves(c: GameplayInteractionController): { x: number; y: number }[] {
  if (kickoffTurnOf(c.gameService.getState())?.play.kind !== "one-square") return [];
  const mover = c.selectedPlayerId ? c.gameService.getPlayerById(c.selectedPlayerId) : undefined;
  if (!mover?.gridPosition) return [];
  return adjacentSquares(mover.gridPosition, { width: GameConfig.PITCH_WIDTH, height: GameConfig.PITCH_HEIGHT })
    .filter((square) => isStandableSquare(square) && !c.getPlayerAt(square.x, square.y));
}

export function kickoffPlayerClick(
  c: GameplayInteractionController,
  playerId: string
): boolean {
  if (c.gameService.getPhase() !== GamePhase.KICKOFF) return false;
  if (playsKickoffActions(c)) return false;
  const square = c.gameService.getPlayerById(playerId)?.gridPosition;
  if (!square || !c.gameService.getKickoffEventStep()) return false;
  handleKickoffClick({ c, ...square, playerAtSquare: c.getPlayerAt(square.x, square.y) });
  return true;
}

function clearKickoffHighlights(c: GameplayInteractionController): void {
  for (const playerId of c.kickoffHighlightedPlayerIds) {
    c.scene.unhighlightPlayer(playerId);
  }
  c.kickoffHighlightedPlayerIds.clear();
  for (const marker of c.kickoffSquareMarkers) {
    marker.destroy();
  }
  c.kickoffSquareMarkers = [];
}

function highlight(
  c: GameplayInteractionController,
  playerId: string,
  color: number
): void {
  if (playerId === c.selectedPlayerId) {
    c.scene.highlightPlayer(playerId);
    return;
  }
  c.scene.highlightPlayer(playerId, color);
  c.kickoffHighlightedPlayerIds.add(playerId);
}

export function syncKickoffStep(c: GameplayInteractionController): void {
  clearKickoffHighlights(c);
  const step = c.gameService.getKickoffEventStep();
  const team = step && c.gameService.getTeam(step.teamId);
  if (!step || !team) return;
  const online = getActiveOnlineMatch();
  if (online && (online.myTeamId !== step.teamId || !online.mayAct())) return;

  const opponents = c.getOpposingPlayers(team.id);
  for (const player of eligibleKickoffPlayers(step, team.players, opponents))
    highlight(c, player.id, 0x38bdf8);
  for (const playerId of waitingPlayerIds(step)) highlight(c, playerId, 0xffd700);
  for (const square of oneSquareMoves(c))
    c.kickoffSquareMarkers.push(c.pitch.highlightSquare(square, 0x22c55e));
}
