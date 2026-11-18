/**
 * The kick-off on the pitch: picking the kicker and the target square, and
 * the players a kick-off event lets the coach pick and move. Nothing here
 * awaits; each command goes out in the tick of the click.
 */

import { GameEventNames } from "@/types/events";
import { SubPhase } from "@/types/GameState";
import { Player, PlayerStatus } from "@/types/Player";
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

/** A team's player clicked during a selection step: pick or drop them. */
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
  // High Kick has exactly one known destination. Selecting the Open
  // receiver on the pitch is the whole interaction.
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

function clickEventStep(
  c: GameplayInteractionController,
  eventStep: KickoffEventStepState,
  x: number,
  y: number,
  playerAtSquare: Player | null
): void {
  const mayAct = getActiveOnlineMatch()?.mayAct() ?? true;
  if (!mayAct) return;

  if (
    playerAtSquare &&
    playerAtSquare.teamId === eventStep.teamId &&
    !eventStep.charge
  ) {
    toggleEventPick(c, eventStep, playerAtSquare);
    return;
  }

  const oneSquare = isOneSquareMoveEvent(eventStep.event);
  // A one-square move goes to the pick the board has marked squares for
  const mover = oneSquare ? steppingPlayerId(eventStep) : c.selectedPlayerId;
  if (!mover) return;
  const applied = oneSquare
    ? c.gameService.moveKickoffEventPlayer(mover, x, y)
    : c.gameService.placeKickoffEventPlayer(mover, x, y);
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

// If own player -> Select/Switch Kicker
function selectKicker(c: GameplayInteractionController, kicker: Player): void {
  // Unhighlight previous if exists
  if (c.selectedPlayerId && c.selectedPlayerId !== kicker.id) {
    c.scene.unhighlightPlayer(c.selectedPlayerId);
  }

  c.selectedPlayerId = kicker.id;
  // Kickoff selection is only for aiming the kick — clear any
  // movement/tackle overlays so it isn't mistaken for an activation.
  c.pitch.clearHighlights();
  c.scene.highlightPlayer(kicker.id);
  c.gameService.selectKicker(kicker.id);
  c.eventBus.emit(
    GameEventNames.UI_Notification,
    "Kicker Selected! Now choose target."
  );
}

/** Controllers whose kick is still resolving. */
const kicking = new WeakSet<GameplayInteractionController>();

function clickKickAim(
  c: GameplayInteractionController,
  x: number,
  y: number,
  playerAtSquare: Player | null
): void {
  // If clicking on one of the kicking team's players
  if (playerAtSquare && playerAtSquare.teamId === c.scene.kickingTeam.id) {
    selectKicker(c, playerAtSquare);
    return;
  }

  // If clicking on a square (Target)
  // Validate Target (Must be opponent half)
  const isTeam1Kicking = c.scene.kickingTeam.id === c.scene.team1.id;
  const isOpponentHalf = !isKickingTeamTerritory(x, isTeam1Kicking);

  if (!isOpponentHalf) {
    // If they clicked an empty square in their own half
    if (c.selectedPlayerId) {
      c.eventBus.emit(
        GameEventNames.UI_Notification,
        "Kick to opponent's half!"
      );
    }
    return;
  }

  // A team with nobody on the pitch kicks without a kicker.
  const nobodyOnPitch = !c.scene.kickingTeam.players.some(
    (p) => p.gridPosition
  );
  // If we have a selected kicker and clicked opponent half -> KICK!
  if (c.selectedPlayerId || nobodyOnPitch) {
    // One kick at a time: a kicker-less kick stays available after the
    // first click, so a second click must not start another sequence.
    if (kicking.has(c)) return;
    kicking.add(c);
    const kicker = c.selectedPlayerId ?? null;
    c.selectedPlayerId = null; // Clear selection after kick
    void Promise.resolve(
      c.gameService.kickBall(isTeam1Kicking, kicker, x, y)
    ).finally(() => kicking.delete(c));
  } else {
    c.eventBus.emit(GameEventNames.UI_Notification, "Select a Kicker first!");
  }
}

export function handleKickoffClick(
  c: GameplayInteractionController,
  x: number,
  y: number,
  playerAtSquare: Player | null
): void {
  const eventStep = c.gameService.getKickoffEventStep();
  if (eventStep) {
    clickEventStep(c, eventStep, x, y, playerAtSquare);
    return;
  }
  if (c.gameService.getSubPhase() === SubPhase.ROLL_KICKOFF) {
    clickKickAim(c, x, y, playerAtSquare);
  }
}

/**
 * The step's team-mates still free to act: Standing, on the pitch, not
 * yet moved, and out of every Standing opponent's reach.
 */
function eligibleKickoffPlayers(
  step: KickoffEventStepState,
  players: Player[],
  opponents: Player[]
): Player[] {
  return players.filter((player) => {
    if (!player.gridPosition || player.status !== PlayerStatus.ACTIVE) {
      return false;
    }
    if (step.movedPlayerIds.includes(player.id)) return false;
    return !opponents.some(
      (opponent) =>
        opponent.status === PlayerStatus.ACTIVE &&
        opponent.gridPosition &&
        Math.max(
          Math.abs(opponent.gridPosition.x - player.gridPosition!.x),
          Math.abs(opponent.gridPosition.y - player.gridPosition!.y)
        ) === 1
    );
  });
}

/**
 * The pick a square click moves: the empty squares around them, any of
 * which they may step to.
 */
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
  const squares: { x: number; y: number }[] = [];
  for (let dx = -1; dx <= 1; dx++)
    for (let dy = -1; dy <= 1; dy++) {
      const x = at.x + dx;
      const y = at.y + dy;
      const onPitch =
        x >= 0 &&
        y >= 0 &&
        x < GameConfig.PITCH_WIDTH &&
        y < GameConfig.PITCH_HEIGHT;
      const taken = everyone.some(
        (p) => p.gridPosition?.x === x && p.gridPosition?.y === y
      );
      if ((dx || dy) && onPitch && !taken) squares.push({ x, y });
    }
  return squares;
}

/** A player clicked during the kick-off; true when the kick-off took it. */
export function kickoffPlayerClick(
  c: GameplayInteractionController,
  playerId: string
): boolean {
  if (c.gameService.getPhase() !== GamePhase.KICKOFF) return false;
  const step = c.gameService.getKickoffEventStep();
  const clicked = c.gameService.getPlayerById(playerId);
  if (step && !step.charge?.activePlayerId && clicked?.gridPosition) {
    handleKickoffClick(
      c,
      clicked.gridPosition.x,
      clicked.gridPosition.y,
      clicked
    );
    return true;
  }
  return (
    !!step?.charge?.activePlayerId && step.charge.activePlayerId !== playerId
  );
}

/**
 * Keep kickoff interaction visible on the board itself. Open eligible
 * players are blue; selected/current players are gold.
 */
export function syncKickoffStep(c: GameplayInteractionController): void {
  for (const playerId of c.kickoffHighlightedPlayerIds) {
    c.scene.unhighlightPlayer(playerId);
  }
  c.kickoffHighlightedPlayerIds.clear();
  c.kickoffSquareMarkers.forEach((marker) => marker.destroy());
  c.kickoffSquareMarkers = [];

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

  // Eligible/selected pitch highlights belong to the deciding coach's own
  // interaction. A coach who cannot act in this step is a passive
  // spectator: they see the owning coach's moves happen live on the board
  // (via the normal PlayerMoved/PlayerPlaced events) without these circles
  // implying they can click anything themselves.
  if (canAct) {
    for (const player of eligible) {
      c.scene.highlightPlayer(player.id, 0x38bdf8);
      c.kickoffHighlightedPlayerIds.add(player.id);
    }
    for (const playerId of step.selectedPlayerIds) {
      c.scene.highlightPlayer(playerId, 0xffd700);
      c.kickoffHighlightedPlayerIds.add(playerId);
    }
    for (const { x, y } of oneSquareMoves(step, team.players, opponents))
      c.kickoffSquareMarkers.push(c.pitch.highlightSquare(x, y, 0x22c55e));
  }
  if (step.charge?.activePlayerId) {
    c.selectedPlayerId = step.charge.activePlayerId;
    if (canAct) {
      c.scene.highlightPlayer(step.charge.activePlayerId, 0xffd700);
      c.kickoffHighlightedPlayerIds.add(step.charge.activePlayerId);
    }
  }
}

/**
 * The Charge! player up was selected: the board takes them, with nothing
 * declared and no route yet. Any selection redraws the step's highlights.
 */
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
