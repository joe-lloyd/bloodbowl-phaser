import type { GameScene } from "./GameScene";
import { PlayerSprite } from "../game/elements/PlayerSprite";
import { BallSprite, CARRIED_HEIGHT } from "../game/elements/BallSprite";
import {
  findBoardStateConflicts,
  isActivatedThisTurn,
  resolveBallRepresentation,
  resolvePlayerLocation,
} from "../game/presentation/boardState";
import { applyPitchRepositioning } from "./setupPlacement";
import { pitchExitFor } from "../game/elements/pitchExits";

/**
 * The player and ball sprites on the pitch, drawn from the game state. The
 * scene owns the sprites; these place them and keep them in step with it.
 */

const allPlayers = (scene: GameScene) => [
  ...scene.team1.players,
  ...scene.team2.players,
];

export function placePlayersOnPitch(scene: GameScene): void {
  if (!scene["isSceneLive"]("placePlayersOnPitch")) return;
  const sprites = scene["playerSprites"];
  // Get all players that have a grid position
  const onPitch = [
    ...scene.team1.players.filter((p) => p.gridPosition),
    ...scene.team2.players.filter((p) => p.gridPosition),
  ];

  onPitch.forEach((player) => {
    const pos = scene["pitch"].getPixelPosition(
      player.gridPosition!.x,
      player.gridPosition!.y
    );

    if (sprites.has(player.id)) {
      const sprite = sprites.get(player.id)!;
      sprite.setPosition(pos.x, pos.y);
      sprite.setVisible(true);
    } else {
      const isTeam1 = player.teamId === scene.team1.id;
      const team = isTeam1 ? scene.team1 : scene.team2;
      // Each side faces the end zone it attacks.
      const sprite = new PlayerSprite(scene, pos.x, pos.y, player, {
        rosterName: team.rosterName,
        colors: scene["kitOf"](team.id),
        facing: isTeam1 ? "e" : "w",
      });
      sprites.set(player.id, sprite);
    }
  });

  // Hide any players that are in dugouts but still have visible pitch sprites
  // (This handles moving from pitch back to dugout)
  allPlayers(scene).forEach((player) => {
    if (!player.gridPosition && sprites.has(player.id)) {
      sprites.get(player.id)!.setVisible(false);
    }
  });

  // Newly created sprites during setup need the reposition drag handlers
  if (scene.isSetupActive && scene["repositionTeam"]) {
    applyPitchRepositioning(scene);
  }

  // Ball is now in scene root with depth 100, so it automatically renders above players (depth 10)
  // No need to manually bring to top

  scene["checkSetupCompleteness"]();
}

/**
 * Animate the ball along a grid path in lockstep with a carrying player's
 * movement animation (same 180ms linear steps as PlayerSprite). Without
 * this the BallPlaced events teleport the ball to the destination before
 * the player sprite even starts walking. `delayMs` holds the ball on its
 * start square until the walking player reaches it (mid-path pickups).
 */
export function animateBallAlong(
  scene: GameScene,
  from: { x: number; y: number },
  path: { x: number; y: number }[],
  delayMs: number
): void {
  const ball = scene["ballSprite"];
  if (!ball || path.length === 0) return;

  const startPx = scene["pitch"].getPixelPosition(from.x, from.y);
  ball.setPosition(startPx.x, startPx.y);

  const tweenConfigs = path.map((step) => {
    const px = scene["pitch"].getPixelPosition(step.x, step.y);
    return { x: px.x, y: px.y, duration: 200, ease: "Linear" };
  });

  scene.tweens.chain({
    targets: ball,
    delay: delayMs,
    tweens: tweenConfigs.map((t) => ({
      ...t,
      // Keep depth sorting with the carrier as the ball moves.
      onUpdate: () => ball.setHeight(ball.altitude),
    })),
  });
}

/**
 * Move THE ball visual to a square. Idempotent by construction: the scene
 * owns at most one BallSprite, which is repositioned (and its in-flight
 * tweens cancelled) rather than destroyed and recreated, so no code path
 * can leave a second ball behind.
 */
export function placeBallVisual(
  scene: GameScene,
  x: number,
  y: number,
  height: number
): void {
  // A BallKicked delivered to a shut-down scene is what crashed the second
  // match of a session (`new BallSprite` on a null `sys`).
  if (!scene["isSceneLive"]("placeBallVisual")) return;

  // Use WORLD coordinates (same as players) since ball will be in scene root
  const pos = scene["pitch"].getPixelPosition(x, y);

  let ball = scene["ballSprite"];
  if (ball?.active) {
    scene.tweens.killTweensOf(ball);
    ball.stopFlight();
    ball.setPosition(pos.x, pos.y);
    // A re-used ball looks the same as a fresh one: no kick-off fade.
    ball.setAlpha(1);
    ball.setVisible(true);
  } else {
    ball = new BallSprite(scene, pos.x, pos.y);
    scene["ballSprite"] = ball;
  }
  ball.setHeight(height);
}

/**
 * Reconcile the ball visual and every carrier marker to the single
 * representation derived from canonical state. Safe to call any number of
 * times: exactly one ball visual survives and exactly one player (or none)
 * is marked as the carrier.
 */
export function reconcileBallVisual(scene: GameScene): void {
  const ball = resolveBallRepresentation(
    scene["gameService"].getState(),
    allPlayers(scene)
  );

  if (ball.kind === "none") {
    scene["ballSprite"]?.destroy();
    scene["ballSprite"] = null;
  } else {
    // Exactly one ball visual, at the one possession square — whether that
    // square is empty (loose) or occupied by the carrier.
    scene["placeBallVisual"](
      ball.square.x,
      ball.square.y,
      ball.kind === "carried" ? CARRIED_HEIGHT : 0
    );
  }

  const carrierId = ball.kind === "carried" ? ball.playerId : null;
  scene["playerSprites"].forEach((sprite, playerId) => {
    sprite.setCarryingBall(playerId === carrierId);
  });
}

/**
 * Reconcile pitch/dugout presentation from `resolvePlayerLocation` — the one
 * function that owns "where is this player represented". A player resolved
 * into a dugout box loses their pitch sprite immediately, even if some rule
 * path left a stale grid position behind.
 */
function reconcilePlayerLocations(scene: GameScene): void {
  allPlayers(scene).forEach((player) =>
    scene.reconcilePlayerLocation(player.id, true)
  );
  scene["dugouts"].forEach((dugout) => dugout.refresh());
}

/**
 * Reconcile one player's pitch/dugout presentation. `reposition` is opt-in:
 * during play a status change must not snap a mid-animation mover back to
 * their grid square, but a player who has left the pitch must disappear from
 * it immediately (KO, casualty, sent off).
 */
export function reconcilePlayerLocation(
  scene: GameScene,
  playerId: string,
  reposition: boolean
): void {
  const player = scene["gameService"].getPlayerById(playerId);
  const sprite = scene["playerSprites"].get(playerId);
  if (!player || !sprite) return;

  const location = resolvePlayerLocation(player);
  if (location.kind !== "pitch") {
    // Seen leaving in play: carried, or walked, from where they were
    if (!reposition && sprite.visible) {
      scene["dugouts"]
        .get(player.teamId)
        ?.arriveFrom(
          player.id,
          { x: sprite.x, y: sprite.y },
          pitchExitFor(player)
        );
    }
    sprite.setCarryingBall(false);
    sprite.setVisible(false);
    scene["dugouts"].forEach((dugout) => dugout.refresh());
    return;
  }

  if (reposition) {
    const pos = scene["pitch"].getPixelPosition(
      location.square.x,
      location.square.y
    );
    sprite.setPosition(pos.x, pos.y);
  }
  sprite.updateStatus();
}

/**
 * Reapply the activated (dimmed) treatment from current-turn state. Only
 * players resolved onto the pitch are touched: clearing the treatment falls
 * back to the status visual, which would otherwise make a dugout player's
 * sprite visible again.
 */
function reconcileActivationStyling(scene: GameScene): void {
  const gameService = scene["gameService"];
  const state = gameService.getState();
  scene["playerSprites"].forEach((sprite, playerId) => {
    const player = gameService.getPlayerById(playerId);
    if (!player || resolvePlayerLocation(player).kind !== "pitch") return;
    sprite.setActivated(isActivatedThisTurn(state, playerId));
  });
}

/**
 * Full-board reconciliation, used by restore/resume and any path that has
 * to rebuild presentation from state alone.
 */
export function reconcileBoard(scene: GameScene): void {
  scene["placePlayersOnPitch"]();
  reconcilePlayerLocations(scene);
  scene.reconcileBallVisual();
  reconcileActivationStyling(scene);
  reportBoardStateConflicts(scene);
}

/**
 * Diagnostic: surface any state that cannot be drawn unambiguously (two
 * balls, a player on the pitch and in a dugout box at once).
 */
function reportBoardStateConflicts(scene: GameScene): void {
  const conflicts = findBoardStateConflicts(
    scene["gameService"].getState(),
    allPlayers(scene)
  );
  if (conflicts.length) {
    console.warn("[GameScene] board state conflicts:", conflicts);
  }
}
