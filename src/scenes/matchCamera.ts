import type { GameScene } from "./GameScene";
import { GamePhase } from "../types/GameState";
import { isTurnRunning } from "../game/kickoff/kickoffTurn";
import { GameEventNames, type GameEvents } from "../types/events";
import { PlayerStatus } from "../types/Player";
import { PassController } from "../game/controllers/PassController";
import { activeLayout } from "../game/variants/activeMatch";
import { PHONE_QUERY, matchesMedia } from "../game/presentation/phoneLayout";
import { squaresOf, type BlockPair } from "./actionOnScreen";
import { isInsideLayout } from "../game/variants/pitchLayouts";

export function followMatchWithCamera(scene: GameScene): void {
  const subscribe = scene.subscribe.bind(scene);
  const camera = () => scene.cameraController;
  const gameService = () => scene.gameService;

  let choosingInterceptor = false;
  let nextPlayerChoice:
    | GameEvents[typeof GameEventNames.Camera_ChooseNextPlayer]
    | null = null;
  const frameNextChoice = () => {
    const intent = nextPlayerChoice;
    if (!intent) return;
    const state = gameService().getState();
    if (
      state.activeTeamId !== intent.teamId ||
      !isTurnRunning(state)
    ) {
      nextPlayerChoice = null;
      return;
    }

    if (
      state.activePlayer ||
      !state.turn.activatedPlayerIds.has(intent.playerId)
    )
      return;
    nextPlayerChoice = null;
    const squares = teamSquares(scene, intent.teamId, true);
    if (squares.length > 0) camera().fitSquares(squares, 420);
  };
  subscribe(GameEventNames.DecisionRequested, (request) => {
    if (request.type !== "interception") return;
    choosingInterceptor = true;
    const squares = squaresOf(
      scene,
      request.candidates.map(({ playerId }) => playerId)
    );
    camera().release();
    camera().focusSquares(squares);
  });
  subscribe(GameEventNames.DecisionResolved, ({ type }) => {
    if (type === "interception") choosingInterceptor = false;
  });
  subscribe(GameEventNames.InterceptionAttempted, ({ interceptorId }) => {
    const square = gameService().getPlayerById(interceptorId)?.gridPosition;
    if (square) camera().focusSquare(square.x, square.y);
  });

  subscribe(GameEventNames.Camera_TrackBall, ({ playerId }) => {
    if (choosingInterceptor) return;
    const target = playerId
      ? scene.playerSprites.get(playerId)
      : scene.ballSprite;
    if (target) camera().follow(target);
  });
  subscribe(GameEventNames.Camera_Reset, (data) => {
    camera().release();
    camera().overview(data.duration || 800);
  });
  subscribe(GameEventNames.PlayerSelected, ({ player }) => {
    if (player) nextPlayerChoice = null;
    if (!player?.gridPosition || scene.isSetupActive || choosingInterceptor)
      return;
    if (gameService().getKickoffEventStep()) return;
    camera().release();

    if (!isTurnRunning(gameService().getState())) {
      camera().overview();
      return;
    }
    frameReach(scene, player.id, player.gridPosition);
  });
  subscribe(
    GameEventNames.KickoffEventStepStarted,
    ({ teamId, landingSquare }) => {
      const squares = teamSquares(scene, teamId);
      if (landingSquare) squares.push(landingSquare);
      camera().release();
      camera().fitSquares(squares, 420);
    }
  );
  subscribe(GameEventNames.PlayerMoved, ({ playerId, to }) => {
    if (scene.isSetupActive || choosingInterceptor) return;
    frameReach(scene, playerId, to, 900);
  });
  const framePair = (pair: BlockPair) => {
    if (!matchesMedia(PHONE_QUERY)) return;
    camera().release();
    camera().focusSquares(squaresOf(scene, [pair.attackerId, pair.defenderId]));
  };
  subscribe(GameEventNames.UI_BlockDialog, framePair);
  subscribe(GameEventNames.BlockDiceRolled, framePair);
  subscribe(GameEventNames.PhaseChanged, ({ phase }) => {
    if (phase === GamePhase.SETUP) camera().reset();
  });

  let restored = false;

  let previousTeamId = gameService().getState().activeTeamId;
  subscribe(GameEventNames.GameStateRestored, (state) => {
    restored = true;
    nextPlayerChoice = null;
    previousTeamId = state.activeTeamId;
    choosingInterceptor = false;
    camera().reset();
  });
  subscribe(GameEventNames.TurnStarted, ({ teamId }) => {
    nextPlayerChoice = null;
    choosingInterceptor = false;
    camera().release();
    const handoff = previousTeamId !== null && previousTeamId !== teamId;
    previousTeamId = teamId;
    if (restored) {
      restored = false;
      camera().overview();
      return;
    }
    const next = teamSquares(scene, teamId);
    if (handoff) camera().handoff(teamSquares(scene), next);
    else if (next.length > 0) camera().fitSquares(next, 650);
    else camera().overview();
  });

  let aimingPass = false;
  subscribe(GameEventNames.UI_UpdateActionSteps, ({ currentStepId }) => {
    const aiming = currentStepId === "pass";
    if (aiming === aimingPass) return;
    aimingPass = aiming;
    const id = gameService().getState().activePlayer?.id;
    const from = id ? gameService().getPlayerById(id)?.gridPosition : null;
    if (!aiming || !id || !from) return;
    const receivers = gameService()
      .getTeammates(id)
      .flatMap((p) =>
        p.status === PlayerStatus.ACTIVE &&
        p.gridPosition &&
        PassController.rangeValue(from, p.gridPosition) !== null
          ? [p.gridPosition]
          : []
      );
    camera().focusSquares([from, ...receivers]);
  });

  subscribe(GameEventNames.Camera_ChooseNextPlayer, (intent) => {
    if (choosingInterceptor) return;
    camera().release();
    nextPlayerChoice = intent;
    frameNextChoice();
  });
  subscribe(GameEventNames.ActionResolved, ({ playerId }) => {
    if (nextPlayerChoice?.playerId === playerId) frameNextChoice();
  });
  subscribe(GameEventNames.NetworkCommandRejected, () => {
    nextPlayerChoice = null;
  });
}

function teamSquares(scene: GameScene, teamId?: string, eligibleOnly = false) {
  const state = scene.gameService.getState();
  return scene.teams.flatMap((team) => team.players).flatMap((p) => {
    const square = p.gridPosition;
    return square &&
      isInsideLayout(activeLayout(), square) &&
      (!teamId || p.teamId === teamId) &&
      (!eligibleOnly ||
        ((p.status === PlayerStatus.ACTIVE ||
          p.status === PlayerStatus.PRONE) &&
          !state.turn.activatedPlayerIds.has(p.id)))
      ? [square]
      : [];
  });
}

function frameReach(
  scene: GameScene,
  playerId: string,
  from: { x: number; y: number },
  duration?: number
): void {
  const reach = scene.gameService.getAvailableMovements(playerId);
  scene.cameraController.focusSquares([from, ...reach], duration);
}
