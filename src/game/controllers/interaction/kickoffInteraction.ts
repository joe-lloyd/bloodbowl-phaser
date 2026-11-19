import { isOpenKickoffPlayer } from "../../kickoff/kickoffEvents";
import { adjacentSquares } from "./squares";
import { GameEventNames } from "@/types/events";
import { SubPhase } from "@/types/GameState";
import { type Player } from "@/types/Player";
import { GameConfig, isKickingTeamTerritory } from "@/config/GameConfig";
import { GamePhase } from "@/types/GameState";
import { getActiveOnlineMatch } from "@/network/OnlineMatch";
import type { KickoffEventStepState } from "../../kickoff/KickoffEventManager";
import {
  KickoffEvent,
  isOneSquareMoveEvent,
  steppingPlayerId,
} from "../../kickoff/kickoffEvents";
import type { GameplayInteractionController } from "../GameplayInteractionController";

function toggleEventPick(
  c: GameplayInteractionController,
  eventStep: KickoffEventStepState,
  playerAtSquare: Player
): void {
  const wasSelected = eventStep.selectedPlayerIds.includes(playerAtSquare.id);
  if (!c.gameService.selectKickoffEventPlayer(playerAtSquare.id)) return;
  c.selectedPlayerId = wasSelected ? null : playerAtSquare.id;
  c.eventBus.emit(GameEventNames.PlayerSelected, {
    player: wasSelected ? null : playerAtSquare,
  });

  if (
    !wasSelected &&
    eventStep.event === KickoffEvent.HIGH_KICK &&
    eventStep.landingSquare
  ) {
    c.gameService.placeKickoffEventPlayer(
      playerAtSquare.id,
      eventStep.landingSquare.x,
      eventStep.landingSquare.y
    );
    c.selectedPlayerId = null;
  }
  c.syncKickoffStepInteraction();
}

function applyEventPick(c: GameplayInteractionController, step: KickoffEventStepState, { x, y }: { x: number; y: number }): boolean | null {
  const oneSquare = isOneSquareMoveEvent(step.event);
  const mover = oneSquare ? steppingPlayerId(step) : c.selectedPlayerId;
  if (!mover) return null;
  return oneSquare ? c.gameService.moveKickoffEventPlayer(mover, x, y) : c.gameService.placeKickoffEventPlayer(mover, x, y);
}

function clickEventStep(
{ c,eventStep,x,y,playerAtSquare }: { c: GameplayInteractionController; eventStep: KickoffEventStepState; x: number; y: number; playerAtSquare: Player|null; }): void {
  const mayAct = getActiveOnlineMatch()?.mayAct() ?? true;
  if (!mayAct) return;

  if (
    playerAtSquare?.teamId === eventStep.teamId &&
    !eventStep.charge
  ) {
    toggleEventPick(c, eventStep, playerAtSquare);
    return;
  }

  const oneSquare = isOneSquareMoveEvent(eventStep.event);

  const applied = applyEventPick(c, eventStep, { x, y });
  if (applied === null) return;
  if (applied) {
    c.selectedPlayerId = null;
    c.syncKickoffStepInteraction();
  } else {
    c.eventBus.emit(
      GameEventNames.UI_Notification,
      oneSquare
        ? `${eventStep.event}: choose one adjacent empty pitch square.`
        : `${eventStep.event}: place the player on the landing square.`
    );
  }
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
  const isOpponentHalf = !isKickingTeamTerritory(x, isTeam1Kicking);

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
    clickEventStep({ c,eventStep,x,y,playerAtSquare });
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
  return players.filter((player) => !step.movedPlayerIds.includes(player.id) && isOpenKickoffPlayer(player, opponents));
}

function oneSquareMoves(
  step: KickoffEventStepState,
  players: Player[],
  opponents: Player[]
): { x: number; y: number }[] {
  const mover = isOneSquareMoveEvent(step.event)
    ? steppingPlayerId(step)
    : null;
  const at = mover
    ? players.find((p) => p.id === mover)?.gridPosition
    : undefined;
  if (!at) return [];
  const everyone = [...players, ...opponents];
  return adjacentSquares(at, { width: GameConfig.PITCH_WIDTH, height: GameConfig.PITCH_HEIGHT })
    .filter(({ x, y }) => !everyone.some((player) => player.gridPosition?.x === x && player.gridPosition.y === y));
}

export function kickoffPlayerClick(
  c: GameplayInteractionController,
  playerId: string
): boolean {
  if (c.gameService.getPhase() !== GamePhase.KICKOFF) return false;
  const step = c.gameService.getKickoffEventStep();
  const clicked = c.gameService.getPlayerById(playerId);
  if (step && !step.charge?.activePlayerId && clicked?.gridPosition) {
    handleKickoffClick(
      { c,x: clicked.gridPosition.x,y: clicked.gridPosition.y,playerAtSquare: clicked }    );
    return true;
  }
  return (
    !!step?.charge?.activePlayerId && step.charge.activePlayerId !== playerId
  );
}

function clearKickoffHighlights(c: GameplayInteractionController): void {
  for (const playerId of c.kickoffHighlightedPlayerIds) {
    c.scene.unhighlightPlayer(playerId);
  }
  c.kickoffHighlightedPlayerIds.clear();
  c.kickoffSquareMarkers.forEach((marker) => {
    marker.destroy();
  });
  c.kickoffSquareMarkers = [];

}

function highlightStepChoices(c: GameplayInteractionController, step: KickoffEventStepState,
  players: { eligible: Player[]; players: Player[]; opponents: Player[] }): void {
    for (const player of players.eligible) {
      c.scene.highlightPlayer(player.id, 0x38bdf8);
      c.kickoffHighlightedPlayerIds.add(player.id);
    }
    for (const playerId of step.selectedPlayerIds) {
      c.scene.highlightPlayer(playerId, 0xffd700);
      c.kickoffHighlightedPlayerIds.add(playerId);
    }
    for (const { x, y } of oneSquareMoves(step, players.players, players.opponents))
      c.kickoffSquareMarkers.push(c.pitch.highlightSquare({ x: x, y: y }, 0x22c55e));
  }

export function syncKickoffStep(c: GameplayInteractionController): void {
  clearKickoffHighlights(c);
  const step = c.gameService.getKickoffEventStep();
  if (!step) return;

  const team = c.gameService.getTeam(step.teamId);
  if (!team) return;
  const onlineMatch = getActiveOnlineMatch();
  const canAct =
    !onlineMatch ||
    (onlineMatch.myTeamId === step.teamId && onlineMatch.mayAct());
  const opponents =
    team.id === c.scene.team1.id
      ? c.scene.team2.players
      : c.scene.team1.players;
  const eligible = eligibleKickoffPlayers(step, team.players, opponents);

  if (canAct) highlightStepChoices(c, step, { eligible, players: team.players, opponents });
  if (step.charge?.activePlayerId) {
    c.selectedPlayerId = step.charge.activePlayerId;
    if (canAct) {
      c.scene.highlightPlayer(step.charge.activePlayerId, 0xffd700);
      c.kickoffHighlightedPlayerIds.add(step.charge.activePlayerId);
    }
  }
}

export function followChargeSelection(
  c: GameplayInteractionController,
  player: Player | null
): void {
  const step = c.gameService.getKickoffEventStep();
  if (!step) return;
  if (
    step.charge?.activePlayerId &&
    player?.id === step.charge.activePlayerId
  ) {
    if (
      c.selectedPlayerId &&
      c.selectedPlayerId !== step.charge.activePlayerId
    ) {
      c.scene.unhighlightPlayer(c.selectedPlayerId);
    }
    c.selectedPlayerId = step.charge.activePlayerId;
    c.currentActionMode = null;
    c.currentStepId = null;
    c.actionSteps = [];
    c.clearWaypoints();
    c.hasMovedInAction = false;
    c.pitch.clearPath();
    c.pitch.clearPassVisualization();
  }
  c.syncKickoffStepInteraction();
}
