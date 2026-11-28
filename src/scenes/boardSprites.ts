import type { GameScene } from "./GameScene";
import type { Player } from "../types/Player";
import { PlayerSprite } from "../game/elements/PlayerSprite";
import { BallSprite, CARRIED_HEIGHT } from "../game/elements/BallSprite";
import {
  type BallRepresentation,
  findBoardStateConflicts,
  isActivatedThisTurn,
  resolveBallRepresentation,
  resolvePlayerLocation,
} from "../game/presentation/boardState";
import { applyPitchRepositioning } from "./setupPlacement";
import { pitchExitFor } from "../game/elements/pitchExits";
import type { Facing } from "../game/presentation/playerArt";
import type { Frame } from "../game/rules/frames";
import { seatOf, seatTeams } from "../game/seating";
import { activeLayout } from "../game/variants/activeMatch";

const allPlayers = (scene: GameScene) =>
  scene.teams.flatMap((team) => team.players);

const HEADING_FACINGS: Readonly<Record<Frame["heading"], Facing>> = {
  "+x": "e",
  "-x": "w",
  "+y": "s",
  "-y": "n",
};

function placePlayerSprite(scene: GameScene, player: Player): void {
  const sprites = scene.playerSprites;
  const pos = scene.pitch.getPixelPosition(
    player.gridPosition!.x,
    player.gridPosition!.y
  );

  if (sprites.has(player.id)) {
    const sprite = sprites.get(player.id)!;
    sprite.setPosition(pos.x, pos.y);
    sprite.setVisible(true);
  } else {
    const { team, frame } = seatOf(
      seatTeams(scene.teams, activeLayout()),
      player.teamId
    );

    const sprite = new PlayerSprite({ scene: scene, x: pos.x, y: pos.y, player: player, look: {
      rosterName: team.rosterName,
      colors: scene.kitOf(team.id),
      facing: HEADING_FACINGS[frame.heading],
    } });
    sprites.set(player.id, sprite);
  }
}

export function placePlayersOnPitch(scene: GameScene): void {
  if (!scene.isSceneLive("placePlayersOnPitch")) return;
  const sprites = scene.playerSprites;

  const onPitch = allPlayers(scene).filter((p) => p.gridPosition);

  for (const player of onPitch) placePlayerSprite(scene, player);

  for (const player of allPlayers(scene)) {
    if (!player.gridPosition && sprites.has(player.id)) {
      sprites.get(player.id)!.setVisible(false);
    }
  }

  if (scene.isSetupActive && scene.repositionTeam) {
    applyPitchRepositioning(scene);
  }

  scene.checkSetupCompleteness();
}

export function animateBallAlong(
  scene: GameScene,
  from: { x: number; y: number },
  path: { x: number; y: number }[],
  delayMs: number
): void {
  const startPx = scene.pitch.getPixelPosition(from.x, from.y);
  bringNearestBallForward(scene, startPx);
  const ball = scene.ballSprite;
  if (!ball || path.length === 0) return;

  ball.setPosition(startPx.x, startPx.y);

  const tweenConfigs = path.map((step) => {
    const px = scene.pitch.getPixelPosition(step.x, step.y);
    return { x: px.x, y: px.y, duration: 200, ease: "Linear" };
  });

  scene.tweens.chain({
    targets: ball,
    delay: delayMs,
    tweens: tweenConfigs.map((t) => ({
      ...t,

      onUpdate: () => ball.setHeight(ball.altitude),
    })),
  });
}

interface Point {
  x: number;
  y: number;
}

const distanceTo = (ball: BallSprite | null, at: Point) =>
  ball?.active ? Math.hypot(ball.x - at.x, ball.y - at.y) : Infinity;

function bringNearestBallForward(scene: GameScene, at: Point): void {
  const spare = scene.spareBallSprite;
  if (distanceTo(spare, at) >= distanceTo(scene.ballSprite, at)) return;
  scene.spareBallSprite = scene.ballSprite;
  scene.ballSprite = spare;
}

function placedBall(scene: GameScene, ball: BallSprite | null, pos: Point): BallSprite {
  if (!ball?.active) return new BallSprite(scene, pos.x, pos.y);
  scene.tweens.killTweensOf(ball);
  ball.stopFlight();
  ball.setPosition(pos.x, pos.y);
  ball.setAlpha(1);
  ball.setVisible(true);
  return ball;
}

export function placeBallVisual(
  scene: GameScene,
  x: number,
  y: number,
  height: number
): void {
  if (!scene.isSceneLive("placeBallVisual")) return;

  const pos = scene.pitch.getPixelPosition(x, y);
  bringNearestBallForward(scene, pos);
  scene.ballSprite = placedBall(scene, scene.ballSprite, pos).setHeight(height);
}

export function dropBallSprites(scene: GameScene): void {
  scene.ballSprite?.destroy();
  scene.ballSprite = null;
  scene.spareBallSprite?.destroy();
  scene.spareBallSprite = null;
}

type ShownBall = Exclude<BallRepresentation, { kind: "none" }>;

function showSpareBall(scene: GameScene, ball: ShownBall | undefined): void {
  if (!ball) {
    scene.spareBallSprite?.destroy();
    scene.spareBallSprite = null;
    return;
  }
  const pos = scene.pitch.getPixelPosition(ball.square.x, ball.square.y);
  const height = ball.kind === "carried" ? CARRIED_HEIGHT : 0;
  scene.spareBallSprite = placedBall(scene, scene.spareBallSprite, pos).setHeight(height);
}

function shownBalls(scene: GameScene): ShownBall[] {
  const state = scene.gameService.getState();
  return state.balls
    .map(({ id }) => resolveBallRepresentation(state, allPlayers(scene), id))
    .filter((ball): ball is ShownBall => ball.kind !== "none");
}

export function reconcileBallVisual(scene: GameScene): void {
  const balls = shownBalls(scene);
  const [first, second] = balls;
  if (first && second) {
    const at = scene.pitch.getPixelPosition(first.square.x, first.square.y);
    bringNearestBallForward(scene, at);
  }
  if (first) {
    scene.placeBallVisual(
      first.square.x,
      first.square.y,
      first.kind === "carried" ? CARRIED_HEIGHT : 0
    );
  } else {
    scene.ballSprite?.destroy();
    scene.ballSprite = null;
  }
  showSpareBall(scene, second);

  const carrierIds = new Set(
    balls.flatMap((ball) => (ball.kind === "carried" ? [ball.playerId] : []))
  );
  scene.playerSprites.forEach((sprite, playerId) => {
    sprite.setCarryingBall(carrierIds.has(playerId));
  });
}

function reconcilePlayerLocations(scene: GameScene): void {
  for (const player of allPlayers(scene)) {
    scene.reconcilePlayerLocation(player.id, true);
  }
  scene.dugouts.forEach((dugout) => {
    dugout.refresh();
  });
}

export function reconcilePlayerLocation(
  scene: GameScene,
  playerId: string,
  reposition: boolean
): void {
  const player = scene.gameService.getPlayerById(playerId);
  const sprite = scene.playerSprites.get(playerId);
  if (!player || !sprite) return;

  const location = resolvePlayerLocation(player);
  if (location.kind !== "pitch") {
    if (!reposition && sprite.visible) {
      scene.dugouts
        .get(player.teamId)
        ?.arriveFrom(
          player.id,
          { x: sprite.x, y: sprite.y },
          pitchExitFor(player)
        );
    }
    sprite.setCarryingBall(false);
    sprite.setVisible(false);
    scene.dugouts.forEach((dugout) => {
      dugout.refresh();
    });
    return;
  }

  if (reposition) {
    const pos = scene.pitch.getPixelPosition(
      location.square.x,
      location.square.y
    );
    sprite.setPosition(pos.x, pos.y);
  }
  sprite.updateStatus();
}

function reconcileActivationStyling(scene: GameScene): void {
  const gameService = scene.gameService;
  const state = gameService.getState();
  scene.playerSprites.forEach((sprite, playerId) => {
    const player = gameService.getPlayerById(playerId);
    if (!player || resolvePlayerLocation(player).kind !== "pitch") return;
    sprite.setActivated(isActivatedThisTurn(state, playerId));
  });
}

export function reconcileBoard(scene: GameScene): void {
  scene.placePlayersOnPitch();
  reconcilePlayerLocations(scene);
  scene.reconcileBallVisual();
  reconcileActivationStyling(scene);
  reportBoardStateConflicts(scene);
}

function reportBoardStateConflicts(scene: GameScene): void {
  const conflicts = findBoardStateConflicts(
    scene.gameService.getState(),
    allPlayers(scene)
  );
  if (conflicts.length > 0) {
    console.warn("[GameScene] board state conflicts:", conflicts);
  }
}
