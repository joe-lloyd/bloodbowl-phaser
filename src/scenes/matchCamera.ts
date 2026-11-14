import type { GameScene } from "./GameScene";
import { GamePhase } from "../types/GameState";
import { GameEventNames } from "../types/events";
import { PlayerStatus } from "../types/Player";
import { PassController } from "../game/controllers/PassController";
import { resolveBallRepresentation } from "../game/presentation/boardState";

/**
 * The match camera follows the game: see CameraController. Every
 * subscription goes through the scene, so its shutdown removes them.
 */
export function followMatchWithCamera(scene: GameScene): void {
  const subscribe = scene["subscribe"].bind(scene);
  const camera = () => scene["cameraController"];
  const gameService = () => scene["gameService"];

  let choosingInterceptor = false;
  subscribe(GameEventNames.DecisionRequested, (request) => {
    if (request.type !== "interception") return;
    choosingInterceptor = true;
    const squares = request.candidates.flatMap(({ playerId }) => {
      const square = gameService().getPlayerById(playerId)?.gridPosition;
      return square ? [square] : [];
    });
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
      ? scene["playerSprites"].get(playerId)
      : scene["ballSprite"];
    if (target) camera().follow(target);
  });
  subscribe(GameEventNames.Camera_Reset, (data) => {
    camera().reset(data.duration || 800);
  });
  subscribe(GameEventNames.PlayerSelected, ({ player }) => {
    if (!player?.gridPosition || scene.isSetupActive || choosingInterceptor)
      return;
    camera().release();
    // The kicker aims anywhere in the other half: keep it all in view
    if (gameService().getPhase() === GamePhase.KICKOFF) {
      camera().overview();
      return;
    }
    frameReach(scene, player.id, player.gridPosition);
  });
  subscribe(GameEventNames.PlayerMoved, ({ playerId, to }) => {
    if (scene.isSetupActive || choosingInterceptor) return;
    frameReach(scene, playerId, to, 900);
  });
  subscribe(GameEventNames.PhaseChanged, ({ phase }) => {
    // Setup wants both benches in view for dragging players on.
    if (phase === GamePhase.SETUP) camera().reset();
  });
  // A loaded scenario or a resumed match shows the whole board first; the
  // turn start that follows the restore keeps the overview
  let restored = false;
  subscribe(GameEventNames.GameStateRestored, () => {
    restored = true;
  });
  // A new turn frames the acting team with the ball, so every player the
  // coach may move is in view (the ball alone left the team off screen
  // when it lay in the other half)
  subscribe(GameEventNames.TurnStarted, ({ teamId }) => {
    choosingInterceptor = false;
    camera().release();
    if (restored) {
      restored = false;
      camera().overview();
      return;
    }
    frameActingTeam(scene, teamId);
  });
  // Aiming a pass: the thrower and every team-mate in range, so the
  // receiver is on screen to click
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
  // Once a player is done, show the team-mates still to go
  subscribe(GameEventNames.PlayerActivated, () => {
    if (choosingInterceptor) return;
    const teamId = gameService().getState().activeTeamId;
    if (teamId) frameActingTeam(scene, teamId, 900);
  });
}

/**
 * Frame the acting team's players who have not yet acted, with the ball.
 * At the start of a turn that is every player the coach may move.
 */
function frameActingTeam(
  scene: GameScene,
  teamId: string,
  duration?: number
): void {
  const state = scene["gameService"].getState();
  const players = [...scene.team1.players, ...scene.team2.players];
  const ball = resolveBallRepresentation(state, players);
  const acting = players
    .filter(
      (p) =>
        p.teamId === teamId &&
        p.gridPosition &&
        !state.turn.activatedPlayerIds.has(p.id)
    )
    .map((p) => p.gridPosition!);
  const squares = ball.kind === "none" ? acting : [...acting, ball.square];
  if (squares.length === 0) scene["cameraController"].overview();
  else scene["cameraController"].focusSquares(squares, duration);
}

/**
 * Frame a player with every square they can still move to, so the coach
 * can click where they want to end up. Anyone who cannot move (an
 * opponent, a spent player) just gets their own square.
 */
function frameReach(
  scene: GameScene,
  playerId: string,
  from: { x: number; y: number },
  duration?: number
): void {
  const reach = scene["gameService"].getAvailableMovements(playerId);
  scene["cameraController"].focusSquares([from, ...reach], duration);
}
