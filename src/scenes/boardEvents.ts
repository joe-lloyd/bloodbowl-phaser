import type { GameScene } from "./GameScene";
import { GamePhase, SubPhase } from "../types/GameState";
import { GameEventNames } from "../types/events";
import { getActiveOnlineMatch } from "../network/OnlineMatch";

const DROP_COMMANDS = new Set([
  "place-player",
  "remove-player",
  "kickoff-place-player",
]);

export function subscribeBoardEvents(scene: GameScene): void {
  const subscribe = scene.subscribe.bind(scene);
  const gameService = () => scene.gameService;
  const eventBus = () => scene.eventBus;

  subscribe(GameEventNames.UI_RequestCoinFlipState, () => {
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

  subscribe(GameEventNames.RefreshBoard, () => {
    scene.reconcileBallVisual();

    scene.playerSprites.forEach((sprite) => {
      sprite.setActivated(false);
      sprite.setTeamTurnBorder(false);
      sprite.resetOrientation();
    });
    scene.setRemoteSelection(null);
    scene.refreshDugouts();
  });

  subscribe(GameEventNames.UI_SyncBoard, (data) => {
    if (gameService().getPhase() === GamePhase.SETUP) {
      scene.refreshDugouts();
      return;
    }
    if (data?.positions) {
      scene.refreshDugouts();
      const ball = gameService().getState().ballPosition;
      if (ball) scene.placeBallVisual(ball.x, ball.y);
    }
    scene.syncPlayerStatuses();
  });

  subscribe(GameEventNames.NetworkCommandRejected, ({ commandType }) => {
    if (DROP_COMMANDS.has(commandType)) scene.refreshDugouts();
  });

  let otherMovesDrawn = 0;
  subscribe(GameEventNames.UI_ShowOtherCoachMove, ({ from, path, ma }) => {
    otherMovesDrawn++;
    scene.pitch.drawMovementPath([from, ...path], [], ma);
  });
  subscribe(GameEventNames.UI_OtherCoachMoveResolved, ({ playerId }) => {
    const drawn = otherMovesDrawn;
    void scene.playerSettled(playerId).then(() => {
      if (drawn === otherMovesDrawn) scene.pitch.clearPath();
    });
  });

  subscribe(GameEventNames.Touchdown, (data) => {
    scene.playerSprites.forEach((sprite) => {
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

export function subscribeTurnMarkers(scene: GameScene): void {
  const subscribe = scene.subscribe.bind(scene);
  const sprites = () => scene.playerSprites;

  subscribe(GameEventNames.PlayerActivated, (playerId: string) => {
    const sprite = sprites().get(playerId);
    if (sprite) {
      sprite.setActivated(true);
    }
  });

  subscribe(GameEventNames.TurnStarted, (turnData) => {
    const onlineMatch = getActiveOnlineMatch();
    sprites().forEach((sprite) => {
      sprite.setActivated(false);
      const isMyTeam =
        !onlineMatch || sprite.getPlayer().teamId === onlineMatch.myTeamId;
      sprite.setTeamTurnBorder(
        sprite.getPlayer().teamId === turnData.teamId && isMyTeam
      );
    });

    scene.gameplayController.deselectPlayer();

    scene.setRemoteSelection(null);
  });

  subscribe(GameEventNames.TurnEnded, () => {
    sprites().forEach((sprite) => {
      sprite.setTeamTurnBorder(false);
    });
  });

  subscribe(GameEventNames.RemoteSelectionChanged, ({ playerId }) => {
    scene.setRemoteSelection(playerId);
  });
}
