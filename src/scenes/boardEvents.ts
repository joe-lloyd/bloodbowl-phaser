import type { GameScene } from "./GameScene";
import { GamePhase, SubPhase } from "../types/GameState";
import { GameEventNames } from "../types/events";
import { getActiveOnlineMatch } from "../network/OnlineMatch";

/** The commands a dropped player sends: see GameScene.awaitsEngine. */
const DROP_COMMANDS = new Set([
  "place-player",
  "remove-player",
  "kickoff-place-player",
]);

/**
 * The game events that redraw the board: drive resets, online snapshots,
 * the other coach's moves, celebrations. Every subscription goes through
 * the scene, so its shutdown removes them.
 */
export function subscribeBoardEvents(scene: GameScene): void {
  const subscribe = scene["subscribe"].bind(scene);
  const gameService = () => scene["gameService"];
  const eventBus = () => scene["eventBus"];

  // Handle late UI mounting (handshake).
  // The coin flip only exists before the first drive — later drives set
  // the kicking team automatically, so never re-show the overlay then.
  subscribe(GameEventNames.UI_RequestCoinFlipState, () => {
    // Only once the introductions are over
    if (
      scene.isSetupActive &&
      gameService().getSubPhase() === SubPhase.COIN_FLIP &&
      gameService().canCoinFlip()
    ) {
      eventBus().emit(GameEventNames.UI_StartCoinFlip, {
        team1: scene.team1,
        team2: scene.team2,
      });
    }
  });

  // End-of-drive: clear the ball visual and refresh dugouts/pitch when the
  // engine resets drive state, and surface KO recovery results.
  subscribe(GameEventNames.RefreshBoard, () => {
    // The reset takes the ball off the pitch. Derive the ball and the
    // carrier marker from that state, as during play: destroying only the
    // ball sprite left the scorer marked as carrier until the kick-off.
    scene.reconcileBallVisual();
    // New drive: nobody is "activated", turn borders reset, and any player
    // left Prone (rotated 90°) is stood back upright so the rotation does
    // not carry into the next drive when the sprite is re-placed.
    scene["playerSprites"].forEach((sprite) => {
      sprite.setActivated(false);
      sprite.setTeamTurnBorder(false);
      sprite.resetOrientation();
    });
    scene.setRemoteSelection(null);
    scene.refreshDugouts();
  });

  // Online: a snapshot arrived — reconcile the board to authoritative state.
  // In setup we do a full refresh (repositions from state). In play we only
  // reconcile status visuals (down/up/stunned/off-pitch): a full refresh
  // would snap a mid-animation mover to its grid square, but updateStatus
  // touches only alpha/angle/visibility, never position — so it's safe and
  // catches any status-change event the watcher missed. A resync asks for
  // positions as well: nothing is animating, and it may have rewound.
  subscribe(GameEventNames.UI_SyncBoard, (data) => {
    if (gameService().getPhase() === GamePhase.SETUP) {
      scene.refreshDugouts();
      return;
    }
    if (data?.positions) {
      scene.refreshDugouts();
      const ball = gameService().getState().ballPosition;
      if (ball) scene["placeBallVisual"](ball.x, ball.y);
    }
    scene.syncPlayerStatuses();
  });

  // A drop the engine turned down after the board let go of it: the board
  // left the player where they were dropped (see awaitsEngine), and the
  // record still has them where they were, so a redraw puts them back.
  subscribe(GameEventNames.NetworkCommandRejected, ({ commandType }) => {
    if (DROP_COMMANDS.has(commandType)) scene.refreshDugouts();
  });

  // Online: the other coach's move, drawn as one line while the player
  // runs it, and cleared once the move has run here and the walk has
  // played, rather than after a guess at how long the walk takes
  let otherMovesDrawn = 0;
  subscribe(GameEventNames.UI_ShowOtherCoachMove, ({ from, path, ma }) => {
    otherMovesDrawn++;
    scene["pitch"].drawMovementPath([from, ...path], [], ma);
  });
  subscribe(GameEventNames.UI_OtherCoachMoveResolved, ({ playerId }) => {
    const drawn = otherMovesDrawn;
    void scene.playerSettled(playerId).then(() => {
      // A later move's path is not this one's to clear
      if (drawn === otherMovesDrawn) scene["pitch"].clearPath();
    });
  });

  // Touchdown celebration: the scoring team's players on the pitch jump
  subscribe(GameEventNames.Touchdown, (data) => {
    scene["playerSprites"].forEach((sprite) => {
      const p = sprite.getPlayer();
      if (p.teamId === data.teamId && p.gridPosition) {
        sprite.playCelebrateAnimation();
      }
    });
  });

  subscribe(GameEventNames.KORecoveryRolled, (data) => {
    const player = gameService().getPlayerById(data.playerId);
    const name = player?.playerName ?? data.playerId;
    eventBus().emit(GameEventNames.UI_LogEntry, {
      category: "drive",
      headline: data.recovered ? `${name} recovers!` : `${name} still out`,
      detail: data.recovered
        ? "Shakes it off and returns to the Reserves."
        : "Still out cold.",
      roll: data.roll,
      teamId: player?.teamId,
    });
  });
}

/**
 * The rings on the pitch that say whose turn it is, who has acted, and
 * which player the other coach has selected online.
 */
export function subscribeTurnMarkers(scene: GameScene): void {
  const subscribe = scene["subscribe"].bind(scene);
  const sprites = () => scene["playerSprites"];

  subscribe(GameEventNames.PlayerActivated, (playerId: string) => {
    const sprite = sprites().get(playerId);
    if (sprite) {
      sprite.setActivated(true);
    }
  });

  subscribe(GameEventNames.TurnStarted, (turnData) => {
    // Reset all sprites and mark the active team with square borders.
    // Online only: never show the blanket "active team" white square for
    // a team the local coach doesn't control — that's replaced by the
    // single-player remote-selection red ring (see RemoteSelectionChanged).
    const onlineMatch = getActiveOnlineMatch();
    sprites().forEach((sprite) => {
      sprite.setActivated(false);
      const isMyTeam =
        !onlineMatch || sprite.getPlayer().teamId === onlineMatch.myTeamId;
      sprite.setTeamTurnBorder(
        sprite.getPlayer().teamId === turnData.teamId && isMyTeam
      );
    });
    // Reset selection
    scene["gameplayController"].deselectPlayer();
    // A stale remote-selection ring (opponent disconnected mid-selection,
    // or the turn simply ended without a drive-ending RefreshBoard) must
    // not persist into the new turn.
    scene.setRemoteSelection(null);
  });

  // The rings mark the team whose turn it is. A turn with none after it
  // (half time, full time) takes them away; the next turn draws its own.
  subscribe(GameEventNames.TurnEnded, () =>
    sprites().forEach((sprite) => sprite.setTeamTurnBorder(false))
  );

  // Online only: show a live indicator of which single opposing player
  // the other coach currently has selected, in place of the blanket
  // whole-team highlight suppressed above.
  subscribe(GameEventNames.RemoteSelectionChanged, ({ playerId }) => {
    scene.setRemoteSelection(playerId);
  });
}
