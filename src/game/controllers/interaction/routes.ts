/**
 * Planning a move on the pitch and walking it: the waypoints a click or a
 * drag adds, the path and rolls drawn for them, the range overlay, and the
 * walk that stops before each Dodge or Rush to ask the coach.
 *
 * moveAlong holds every await of a walk, where the controller had them
 * before the split. Everything it calls between awaits is synchronous.
 */

import { GameEventNames } from "@/types/events";
import { Player, PlayerStatus, hasTackleZone } from "@/types/Player";
import { SkillType, hasSkill } from "@/types/Skills";
import { GamePhase } from "@/types/GameState";
import { getActiveOnlineMatch } from "@/network/OnlineMatch";
import { moveAllowance, standUpCost } from "../../skills/movement";
import { withDriveModifiers } from "../../kickoff/driveEffects";
import { planMoveLegs, stepRolls } from "../../rules/moveLegs";
import { rushModifier } from "../../inducements/matchInducements";
import {
  pickupTarget,
  secureBallTarget,
  RoutePreview,
  RouteRoll,
} from "../../rules/rollPreview";
import { isSecuringBall } from "../../rules/secureBall";
import { ballInTheAir } from "../../rules/ballInTheAir";
import type { GameplayInteractionController } from "../GameplayInteractionController";
import { riskyStepRequest } from "./Confirmations";

type Square = { x: number; y: number };

/** The on-pitch players beside and against a team. */
function sidesOf(
  c: GameplayInteractionController,
  player: Player
): { teammates: Player[]; opponents: Player[] } {
  const team =
    player.teamId === c.getSceneTeam1().id
      ? c.getSceneTeam1()
      : c.getSceneTeam2();
  const opponentTeam =
    player.teamId === c.getSceneTeam1().id
      ? c.getSceneTeam2()
      : c.getSceneTeam1();
  return {
    teammates: team.players.filter((p) => p.gridPosition && p.id !== player.id),
    opponents: opponentTeam.players.filter((p) => p.gridPosition),
  };
}

/**
 * The shortest legal way from the end of the plotted route to (x, y),
 * within the squares left after earlier moves and legs.
 */
function findLeg(
  c: GameplayInteractionController,
  player: Player,
  x: number,
  y: number
) {
  const effectivePlayer = withDriveModifiers(player, c.gameService.getState());
  const startPos =
    c.waypoints.length > 0
      ? c.waypoints[c.waypoints.length - 1]
      : player.gridPosition!;
  const { opponents, teammates } = sidesOf(c, player);
  const mockPlayer = { ...effectivePlayer, gridPosition: startPos };
  return c.movementValidator.findPath(
    mockPlayer,
    x,
    y,
    opponents,
    teammates,
    c.gameService.getMovementUsed(player.id) + c.waypoints.length
  );
}

export function addWaypoint(
  c: GameplayInteractionController,
  x: number,
  y: number
): void {
  if (!c.selectedPlayerId) return;
  const player = c.gameService.getPlayerById(c.selectedPlayerId);
  if (!player) return;

  // Use pathfinder for this segment (smart pathing between clicks)
  const result = findLeg(c, player, x, y);

  if (!result.valid) {
    c.eventBus.emit(GameEventNames.UI_Notification, "Out of reach");
    return;
  }
  c.waypoints.push(...result.path);
  drawCurrentPath(c);
  // Range/sprint overlays now measure from the last node
  refreshPlayerVisualization(c, player.id);
}

export function executeMove(c: GameplayInteractionController): void {
  if (!c.selectedPlayerId || c.waypoints.length === 0) return;
  void moveAlong(c, c.selectedPlayerId, [...c.waypoints]);
}

function rerollSources(
  c: GameplayInteractionController,
  player: Player,
  kinds: RouteRoll["type"][]
): string[] {
  const arbiter = c.gameService.getRerollArbiter();
  const skills = new Set(
    kinds
      .filter((kind) => kind !== "secureBall")
      .map((kind) =>
        kind === "dodge"
          ? SkillType.DODGE
          : kind === "rush"
            ? SkillType.SURE_FEET
            : SkillType.SURE_HANDS
      )
  );
  const sources: string[] = [];
  for (const skill of skills) {
    if (
      hasSkill(player.skills, skill) &&
      arbiter.skillRerollAvailable(player, skill)
    )
      sources.push(skill);
  }
  const team = arbiter.nextTeamReroll(player.teamId);
  if (team === "free") sources.push("Brilliant Coaching");
  if (team === "leader") sources.push("Leader");
  if (team === "team")
    sources.push(`team ${arbiter.teamRerollsLeftFor(player.teamId)} left`);
  if (
    hasSkill(player.skills, SkillType.PRO) &&
    arbiter.onceAvailable(player, SkillType.PRO)
  )
    sources.push("Pro on 3+");
  if (arbiter.veteranRerollAvailable(player)) sources.push("Veteran");
  return sources;
}

export function planLegs(
  c: GameplayInteractionController,
  player: Player,
  route: Square[]
) {
  const state = c.gameService.getState();
  const mover = withDriveModifiers(player, state);
  const securing = isSecuringBall(state, player.id);
  return planMoveLegs(player.gridPosition!, route, {
    opponents: c.getOpposingPlayers(player.teamId),
    player: mover,
    ma: mover.stats.MA,
    used:
      c.gameService.getMovementUsed(player.id) +
      (player.status === PlayerStatus.PRONE ? standUpCost(mover) : 0),
    rushModifier: rushModifier(state, player),
    // A kick still in the air is no loose ball: whoever stands under it
    // Catches it when it lands
    pickup:
      state.ballPosition &&
      !ballInTheAir(state) &&
      !c.getPlayerAt(state.ballPosition.x, state.ballPosition.y)
        ? {
            square: state.ballPosition,
            target: (securing ? secureBallTarget : pickupTarget)(
              mover,
              state.ballPosition,
              c.getOpposingPlayers(player.teamId),
              state.weather
            ),
            ...(securing ? { securing: true } : {}),
          }
        : undefined,
  });
}

function drawPlannedRoute(
  c: GameplayInteractionController,
  player: Player,
  fullPath: Square[]
): RoutePreview {
  const legs = planLegs(c, player, fullPath.slice(1));
  const rolls = legs.flatMap((leg) =>
    leg.risk ? stepRolls(leg.risk, leg.path[0]) : []
  );
  const mover = withDriveModifiers(player, c.gameService.getState());
  const left = Math.max(
    0,
    mover.stats.MA -
      c.gameService.getMovementUsed(player.id) -
      (player.status === PlayerStatus.PRONE ? standUpCost(mover) : 0)
  );
  c.pitch.drawMovementPath(fullPath, rolls, left);
  const route: RoutePreview = {
    movementLeft: left,
    riskySteps: rolls.length,
    rolls,
    rerolls: rerollSources(
      c,
      player,
      rolls.map((r) => r.type)
    ),
  };
  c.eventBus.emit(GameEventNames.UI_RoutePreview, route);
  return route;
}

export function drawCurrentPath(c: GameplayInteractionController): void {
  if (!c.selectedPlayerId) return;

  // We need to calculate rolls for the FULL path to visualize correctly
  // Recalculate rolls based on full sequence
  // This is a bit heavy but ensures correct visualization (dodge/gfi)

  // TODO: Use a validator helper to "Analyze Path"
  // For now, simple draw
  const player = c.gameService.getPlayerById(c.selectedPlayerId);
  if (player && player.gridPosition) {
    const fullPath = [
      { x: player.gridPosition.x, y: player.gridPosition.y },
      ...c.waypoints,
    ];
    const route = drawPlannedRoute(c, player, fullPath);
    c.eventBus.emit(GameEventNames.UI_MovePlan, {
      ...route,
      squares: c.waypoints.length,
    });
  }
}

export function drawPath(
  c: GameplayInteractionController,
  x: number,
  y: number
): void {
  if (!c.selectedPlayerId) return;
  const player = c.gameService.getPlayerById(c.selectedPlayerId);
  if (!player) return;

  // Don't draw preview if not active team
  const state = c.gameService.getState();
  if (state.activeTeamId !== player.teamId) return;

  // Find path for segment, from the last waypoint
  const result = findLeg(c, player, x, y);

  if (result.valid) {
    // Combine confirmed waypoints + preview path
    // ALSO include the player's current position as the start of the visual path
    const fullPath = [
      { x: player.gridPosition!.x, y: player.gridPosition!.y },
      ...c.waypoints,
      ...result.path,
    ];
    // TODO: Get rolls for full path
    drawPlannedRoute(c, player, fullPath);
  } else {
    // Just draw existing waypoints if preview is invalid
    if (c.waypoints.length > 0) {
      const fullPath = [
        { x: player.gridPosition!.x, y: player.gridPosition!.y },
        ...c.waypoints,
      ];
      drawPlannedRoute(c, player, fullPath);
    } else {
      c.pitch.clearPath();
    }
  }
}

/**
 * Every square the player can still reach, coloured by whether it needs a
 * Rush. With waypoints planned, the range is drawn as if the player already
 * stood on the last node with the spent squares deducted.
 */
function drawMoveRange(
  c: GameplayInteractionController,
  player: Player,
  effectivePlayer: Player
): void {
  // Calculate remaining SAFE MA (for overlay coloring)
  let used = c.gameService.getMovementUsed(player.id);

  // If prone, they need to spend 3 MA to stand (or all MA if less than 3)
  if (player.status === "Prone") {
    const standUpCost = Math.min(3, effectivePlayer.stats.MA);
    used += standUpCost;
  }

  let reachable: { x: number; y: number; cost?: number }[];
  if (c.waypoints.length > 0) {
    const lastNode = c.waypoints[c.waypoints.length - 1];
    const { opponents, teammates } = sidesOf(c, player);
    const remainingAllowance = Math.max(
      0,
      moveAllowance(effectivePlayer) - used - c.waypoints.length
    );
    reachable = c.movementValidator
      .findReachableSquares(
        { ...effectivePlayer, gridPosition: { ...lastNode } },
        opponents,
        teammates
      )
      .filter((m) => m.cost <= remainingAllowance);
    used += c.waypoints.length;
  } else {
    reachable = c.gameService.getAvailableMovements(player.id);
  }

  const remainingSafeMA = Math.max(0, effectivePlayer.stats.MA - used);

  // Sprint moves need a Rush (> remaining MA); every reachable square is
  // still drawn lit
  const sprintMoves = reachable.filter(
    (move) => move.cost !== undefined && move.cost > remainingSafeMA
  );

  // Show Overlay (Inverse of ALL reachable)
  c.pitch.drawRangeOverlay(reachable);

  // Show Sprint Risks
  c.pitch.drawSprintRisks(sprintMoves);
}

/** The squares around each opponent that exerts a Tackle Zone. */
function tackleZoneSquares(opponents: Player[]): Square[] {
  const tackleZones: Square[] = [];
  for (const op of opponents) {
    // Standing and not Distracted — Distracted opponents draw none
    if (!hasTackleZone(op) || !op.gridPosition) continue;
    // Add 8 squares around
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const tx = op.gridPosition.x + dx;
        const ty = op.gridPosition.y + dy;
        // Check bounds (0-25, 0-14)
        const onPitch = tx >= 0 && tx < 26 && ty >= 0 && ty < 15;
        if ((dx !== 0 || dy !== 0) && onPitch)
          tackleZones.push({ x: tx, y: ty });
      }
    }
  }
  return tackleZones;
}

/**
 * No route may start now: something is in flight, the other coach owns
 * the board, play has stopped outside a Charge!, or the action does not
 * move.
 */
function routesClosed(c: GameplayInteractionController): boolean {
  if (c.isBusy || c.push.active) return true;
  if (getActiveOnlineMatch()?.mayAct() === false) return true;
  const state = c.gameService.getState();
  const charging =
    !!c.gameService.getKickoffEventStep()?.charge?.activePlayerId;
  if (state.phase !== GamePhase.PLAY && !charging) return true;
  const mode = c.currentActionMode;
  return (
    mode !== null &&
    mode !== "move" &&
    mode !== "blitz" &&
    mode !== "secureBall"
  );
}

/** The player whose route a drag from this square would draw, if any. */
export function routeOwnerAt(
  c: GameplayInteractionController,
  x: number,
  y: number
): Player | null {
  if (routesClosed(c)) return null;
  const state = c.gameService.getState();
  const mode = c.currentActionMode;
  const id = c.selectedPlayerId;
  const selected = id ? c.gameService.getPlayerById(id) : undefined;
  const end = c.waypoints[c.waypoints.length - 1];
  if (selected && end?.x === x && end.y === y) return selected;
  const there = c.getPlayerAt(x, y);
  if (!there || !mayDrawRouteFor(c, there, state.activeTeamId)) return null;
  // Another player only while the selected one has not started an action
  if (there.id !== id && mode !== null) return null;
  const online = getActiveOnlineMatch();
  if (online && online.myTeamId !== there.teamId) return null;
  return there;
}

function mayDrawRouteFor(
  c: GameplayInteractionController,
  player: Player,
  activeTeamId: string | null | undefined
): boolean {
  return player.teamId === activeTeamId && c.gameService.canActivate(player.id);
}

/**
 * The dragging finger reached a square. Back over the route cuts it to
 * there; anywhere else adds the square, by the shortest legal way from
 * the route's end, as a click on it would.
 */
export function dragRouteTo(
  c: GameplayInteractionController,
  player: Player,
  start: Square,
  x: number,
  y: number
): void {
  const end = c.waypoints[c.waypoints.length - 1] ?? start;
  if (end.x === x && end.y === y) return;
  if (start.x === x && start.y === y) {
    c.clearWaypoints();
    c.clearRollPreviews();
    c.pitch.clearPath();
    refreshPlayerVisualization(c, player.id);
    return;
  }
  const back = c.waypoints.findIndex((p) => p.x === x && p.y === y);
  if (back >= 0) {
    c.waypoints = c.waypoints.slice(0, back + 1);
    drawCurrentPath(c);
    refreshPlayerVisualization(c, player.id);
    return;
  }
  if (c.getPlayerAt(x, y)) return;
  const state = c.gameService.getState();
  const action =
    state.activePlayer?.id === player.id
      ? state.activePlayer.action
      : undefined;
  if (!c.declareMoveIfNone(player.id, action)) return;
  // A finger going diagonally clips a square beside the corner: one step
  // reaches here from the square before that, so the clipped one goes
  const route = c.waypoints;
  const before = route[route.length - 2] ?? start;
  if (
    route.length > 0 &&
    Math.max(Math.abs(before.x - x), Math.abs(before.y - y)) === 1
  ) {
    c.waypoints = route.slice(0, -1);
  }
  addWaypoint(c, x, y);
  // Out of reach: the route stays as it was
  if (c.waypoints.length <= route.length - 1) c.waypoints = route;
}

/**
 * Whether this player's activation runs on after a step: a turn of the
 * drive they have not finished, or the Charge! activation they are up in.
 */
function isStillActing(
  c: GameplayInteractionController,
  playerId: string
): boolean {
  const chargerId = c.gameService.getKickoffEventStep()?.charge?.activePlayerId;
  if (chargerId) return chargerId === playerId;
  return (
    c.gameService.getState().phase === GamePhase.PLAY &&
    !c.gameService.hasPlayerActed(playerId)
  );
}

/** The walk stopped before the leg's end: a fall, a turnover, or no more acting. */
function stoppedShort(
  c: GameplayInteractionController,
  playerId: string,
  end: Square
): boolean {
  const now = c.gameService.getPlayerById(playerId);
  return (
    !isStillActing(c, playerId) ||
    now?.status !== PlayerStatus.ACTIVE ||
    now.gridPosition?.x !== end.x ||
    now.gridPosition?.y !== end.y
  );
}

function afterMove(c: GameplayInteractionController, playerId: string): void {
  // GameService finishes the activation once MA+2 is spent; otherwise the
  // player stays selected to plot the next leg.
  if (!isStillActing(c, playerId)) {
    // A Charge! that ran out of squares has already handed the board to
    // the next charger: leave their unspent movement state alone
    if (c.selectedPlayerId === playerId) c.deselectPlayer();
    return;
  }
  c.hasMovedInAction = true;
  c.eventBus.emit(GameEventNames.PlayerMovedInAction, { playerId });
  c.clearWaypoints();
  c.pitch.clearPath();
  // Calling selectPlayer would reset the action mode
  refreshPlayerVisualization(c, playerId);
}

/**
 * Walk the plotted route a leg at a time. A stretch that rolls nothing goes
 * as one move; each Dodge or Rush stops the player on the square before
 * it, asks the coach, and goes alone, so its dice land before the walk
 * carries on. Declining stops the player there with the movement left.
 */
async function moveAlong(
  c: GameplayInteractionController,
  playerId: string,
  route: Square[]
): Promise<void> {
  c.isBusy = true;
  c.clearWaypoints();
  c.clearRollPreviews();
  c.pitch.clearPath();
  let walked = false;
  try {
    let rest = route;
    while (rest.length > 0) {
      const player = c.gameService.getPlayerById(playerId);
      if (!player?.gridPosition) break;
      const [leg] = planLegs(c, player, rest);
      if (leg.risk) {
        // The walk stops waiting on the dice after 3 s, but a slow screen
        // or a queue in the tray can take longer: never ask about the
        // next roll while the last one is still in the air
        await c.dice.landed();
        const request = riskyStepRequest(
          c,
          player,
          player.gridPosition,
          leg.risk
        );
        if (!(await c.confirmations.ask("risky-step", request))) break;
      }
      await c.gameService.movePlayer(playerId, leg.path);
      walked = true;
      await c.scene.playerSettled?.(playerId);
      if (stoppedShort(c, playerId, leg.path[leg.path.length - 1])) break;
      rest = rest.slice(leg.path.length);
    }
  } catch (err) {
    console.error("Move failed", err);
    c.isBusy = false;
    c.deselectPlayer();
    return;
  }
  c.isBusy = false;
  if (walked) afterMove(c, playerId);
  else refreshPlayerVisualization(c, playerId);
}

/**
 * The selected player's movement range and the Tackle Zones around them,
 * drawn while their team may still act with them.
 */
export function refreshPlayerVisualization(
  c: GameplayInteractionController,
  playerId: string
): void {
  const state = c.gameService.getState();
  const player = c.gameService.getPlayerById(playerId);
  if (!player) return;
  const effectivePlayer = withDriveModifiers(player, state);

  // canActivate answers for the Charge! window too
  const canActivate = c.gameService.canActivate(playerId);
  const isOwnTurn = state.activeTeamId === player.teamId;
  if (!isOwnTurn || !canActivate) return;

  // Show Movement Range
  // Show range if NOT in Pass Mode OR if in Move Step of Pass Mode. A
  // Ball & Chain lurch goes where the Throw-in Template sends it.
  if (
    c.currentActionMode !== "ballAndChain" &&
    (c.currentActionMode !== "pass" || c.currentStepId === "move")
  ) {
    drawMoveRange(c, player, effectivePlayer);
  } else {
    // Aiming a pass or swinging the chain: clear the movement overlays
    c.pitch.clearLayer("range_overlay");
    c.pitch.clearLayer("sprint_risk");
  }

  // Show Tackle Zones (always show these)
  c.pitch.drawTackleZones(
    tackleZoneSquares(c.getOpposingPlayers(player.teamId))
  );
}
