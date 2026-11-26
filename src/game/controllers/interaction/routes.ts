import { kickoffTurnOf } from "../../kickoff/kickRecord";
import { isOwnActor } from "./players";
import { souvenirModifier } from "../../inducements/souvenirModifiers";
import { adjacentSquares } from "./squares";
import { GameEventNames } from "@/types/events";
import { type Player, PlayerStatus, hasTackleZone } from "@/types/Player";
import { SkillType, hasSkill } from "@/types/Skills";
import { isTurnRunning } from "../../kickoff/kickoffTurn";
import { getActiveOnlineMatch } from "@/network/OnlineMatch";
import { moveAllowance } from "../../skills/movement";
import { withDriveModifiers } from "../../kickoff/driveEffects";
import { planMoveLegs, stepRolls } from "../../rules/moveLegs";
import {
  pickupTarget,
  rushRollModifier,
  secureBallTarget,
  type RoutePreview,
  type RouteRoll,
} from "../../rules/rollPreview";
import type { PlanRollKind } from "../../rules/actionPlan";
import { isSecuringBall } from "../../rules/secureBall";
import { ballInTheAir } from "../../rules/ballInTheAir";
import type { GameplayInteractionController } from "../GameplayInteractionController";
import { climbRequest } from "./Confirmations";
import { plannedActionFor } from "./plan";
import { publishPlan } from "./planSummary";
import { movementAfterRoute, movementStarted, syncMovementHalf } from "./movement";
import { routeSquares, type RouteStep } from "../../rules/jump";
import { usesBaseMove } from "../../rules/actionAvailability";
import type { MoveStep } from "@/headless/protocol";

interface Square {
  x: number;
  y: number;
}

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

export function findLeg(
{ c,player,x,y }: { c: GameplayInteractionController; player: Player; x: number; y: number; }) {
  const effectivePlayer = withDriveModifiers(player, c.gameService.getState());
  const startPos = c.waypoints.at(-1) ?? player.gridPosition;
  if (!startPos) return { valid: false, path: [], rolls: [], cost: 0 };
  const { opponents, teammates } = sidesOf(c, player);
  const mockPlayer = { ...effectivePlayer, gridPosition: startPos };
  return c.movementValidator.findPath({ player: mockPlayer, targetX: x, targetY: y, opponents: opponents, teammates: teammates, movementUsed: c.gameService.getMovementUsed(player.id) + routeSquares(c.waypoints) });
}

export function addWaypoint(
  c: GameplayInteractionController,
  x: number,
  y: number
): void {
  if (!c.selectedPlayerId) return;
  const player = c.gameService.getPlayerById(c.selectedPlayerId);
  if (!player) return;

  const result = findLeg({ c,player,x,y });

  if (!result.valid) {
    c.eventBus.emit(GameEventNames.UI_Notification, "Out of reach");
    return;
  }
  c.waypoints.push(...result.path);
  drawCurrentPath(c);

  refreshPlayerVisualization(c, player.id);
}

export function rerollSources(
  c: GameplayInteractionController,
  player: Player,
  kinds: PlanRollKind[]
): string[] {
  const arbiter = c.gameService.getRerollArbiter();
  const rerollSkill: Partial<Record<PlanRollKind, SkillType>> = {
    dodge: SkillType.DODGE, rush: SkillType.SURE_FEET, pickup: SkillType.SURE_HANDS, pass: SkillType.PASS,
  };
  const skills = new Set(kinds.flatMap((kind) => rerollSkill[kind] ?? []));
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
  else if (team === "leader") sources.push("Leader");
  else if (team === "team")
    sources.push(
      `team ${String(arbiter.teamRerollsLeftFor(player.teamId))} left`
    );
  if (
    hasSkill(player.skills, SkillType.PRO) &&
    arbiter.onceAvailable(player, SkillType.PRO)
  )
    sources.push("Pro on 3+");
  if (arbiter.veteranRerollAvailable(player)) sources.push("Veteran");
  return sources;
}

function planLegs(
  c: GameplayInteractionController,
  player: Player,
  route: RouteStep[]
) {
  const state = c.gameService.getState();
  const mover = withDriveModifiers(player, state);
  const securing = isSecuringBall(state, player.id);
  const start = player.gridPosition;
  if (!start) return [];
  const pickup =
      state.ballPosition &&
      !ballInTheAir(state) &&
      !c.getPlayerAt(state.ballPosition.x, state.ballPosition.y)
        ? {
            square: state.ballPosition,
            target: (securing ? secureBallTarget : pickupTarget)(mover, state.ballPosition, c.getOpposingPlayers(player.teamId), state),
            ...(securing && { securing: true }),
          }
        : undefined;
  return planMoveLegs(start, route, {
    opponents: c.getOpposingPlayers(player.teamId),
    player: mover,
    ma: mover.stats.MA,
    allowance: moveAllowance(mover),
    used: movementStarted(c, mover),
    rushModifier: rushRollModifier(state, player),
    dodgeModifier: souvenirModifier(state, player.id, "dodge"),

    ...(pickup !== undefined && { pickup }),
  });
}

export function routeRolls(
  c: GameplayInteractionController,
  player: Player,
  route: RouteStep[]
): RouteRoll[] {
  return planLegs(c, player, route).flatMap((leg) =>
    leg.risk ? stepRolls(leg.risk, leg.path[0]) : []
  );
}

function drawPlannedRoute(
  c: GameplayInteractionController,
  player: Player,
  fullPath: RouteStep[]
): RoutePreview {
  const rolls = routeRolls(c, player, fullPath.slice(1));
  const mover = withDriveModifiers(player, c.gameService.getState());
  const left = Math.max(
    0,
    mover.stats.MA - movementStarted(c, mover)
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

  const player = c.gameService.getPlayerById(c.selectedPlayerId);
  if (player?.gridPosition) {
    drawPlannedRoute(c, player, [
      { x: player.gridPosition.x, y: player.gridPosition.y },
      ...c.waypoints,
    ]);
  }
  publishPlan(c);
}

export function drawPath(
  c: GameplayInteractionController,
  x: number,
  y: number
): void {
  if (!c.selectedPlayerId) return;
  const player = c.gameService.getPlayerById(c.selectedPlayerId);
  if (!player?.gridPosition) return;

  const state = c.gameService.getState();
  if (state.activeTeamId !== player.teamId) return;

  const result = findLeg({ c,player,x,y });

  if (result.valid) {
    const fullPath = [
      { ...player.gridPosition },
      ...c.waypoints,
      ...result.path,
    ];

    drawPlannedRoute(c, player, fullPath);
  } else {
    if (c.waypoints.length > 0) {
      const fullPath = [
        { ...player.gridPosition },
        ...c.waypoints,
      ];
      drawPlannedRoute(c, player, fullPath);
    } else {
      c.pitch.clearPath();
    }
  }
}

function drawMoveRange(
  c: GameplayInteractionController,
  player: Player,
  effectivePlayer: Player
): void {
  const used = movementAfterRoute(c, effectivePlayer);
  let reachable: { x: number; y: number; cost?: number }[];
  const lastNode = c.waypoints.at(-1);
  if (lastNode) {
    const { opponents, teammates } = sidesOf(c, player);
    const remainingAllowance = Math.max(
      0,
      moveAllowance(effectivePlayer) - used
    );
    reachable = c.movementValidator
      .findReachableSquares(
        { ...effectivePlayer, gridPosition: { ...lastNode } },
        opponents,
        teammates
      )
      .filter((m) => m.cost <= remainingAllowance);
  } else {
    reachable = c.gameService.getAvailableMovements(player.id);
  }

  const remainingSafeMA = Math.max(0, effectivePlayer.stats.MA - used);

  const sprintMoves = reachable.filter(
    (move) => move.cost !== undefined && move.cost > remainingSafeMA
  );

  c.pitch.drawRangeOverlay(reachable);

  c.pitch.drawSprintRisks(sprintMoves);
}

function tackleZoneSquares(opponents: Player[]): Square[] {
  return opponents.flatMap((opponent) => hasTackleZone(opponent) && opponent.gridPosition
    ? adjacentSquares(opponent.gridPosition, { width: 26, height: 15 }) : []);
}

const MOVEMENT_MODES = new Set<GameplayInteractionController["currentActionMode"]>([null, "move", "blitz", "handoff", "foul", "secureBall"]);

function routesInMode(c: GameplayInteractionController): boolean {
  const mode = c.currentActionMode;
  if (MOVEMENT_MODES.has(mode)) return true;
  return mode !== null && c.currentStepId === "move" && usesBaseMove(mode);
}

function routesClosed(c: GameplayInteractionController): boolean {
  if (c.isBusy || c.push.active) return true;
  if (getActiveOnlineMatch()?.mayAct() === false) return true;
  const state = c.gameService.getState();
  if (!isTurnRunning(state) || kickoffTurnOf(state)?.play.kind === "one-square")
    return true;
  return !routesInMode(c);
}

function selectedRouteEndpoint(c: GameplayInteractionController, x: number, y: number): Player | null {
  const selected = c.selectedPlayerId ? c.gameService.getPlayerById(c.selectedPlayerId) : undefined;
  const end = c.waypoints.at(-1);
  return selected && end?.x === x && end.y === y ? selected : null;
}

function ownsRoute(c: GameplayInteractionController, player: Player): boolean {
  if (!isOwnActor(c, player, c.gameService.getState().activeTeamId)) return false;
  if (player.id !== c.selectedPlayerId && c.currentActionMode !== null) return false;
  const online = getActiveOnlineMatch();
  return !online || online.myTeamId === player.teamId;
}

export function routeOwnerAt(c: GameplayInteractionController, x: number, y: number): Player | null {
  if (routesClosed(c)) return null;
  const selected = selectedRouteEndpoint(c, x, y);
  if (selected) return selected;
  const there = c.getPlayerAt(x, y);
  return there && ownsRoute(c, there) ? there : null;
}

function rewindRoute({ c, player, start, x, y }: Parameters<typeof dragRouteTo>[0]): boolean {
  if (start.x === x && start.y === y) {
    c.clearWaypoints();
    c.clearRollPreviews();
    c.pitch.clearPath();
    refreshPlayerVisualization(c, player.id);
    publishPlan(c);
    return true;
  }
  const back = c.waypoints.findIndex((p) => p.x === x && p.y === y);
  if (back !== -1) {
    c.waypoints = c.waypoints.slice(0, back + 1);
    drawCurrentPath(c);
    refreshPlayerVisualization(c, player.id);
    return true;
  }
  return false;
}

function extendRoute(c: GameplayInteractionController, start: Square, { x, y }: Square): void {
  c.jumpTargeting = false;
  const route = c.waypoints;
  const before = route.at(-2) ?? start;
  if (
    route.length > 0 &&
    Math.max(Math.abs(before.x - x), Math.abs(before.y - y)) === 1
  ) {
    c.waypoints = route.slice(0, -1);
  }
  addWaypoint(c, x, y);

  if (c.waypoints.length <= route.length - 1) c.waypoints = route;
}

export function dragRouteTo(
{ c,player,start,x,y }: { c: GameplayInteractionController; player: Player; start: Square; x: number; y: number; }): void {
  const end = c.waypoints.at(-1) ?? start;
  if (end.x === x && end.y === y) return;
  if (rewindRoute({ c, player, start, x, y })) return;
  if (c.getPlayerAt(x, y)) return;
  const state = c.gameService.getState();
  const action = plannedActionFor(c, state, player.id);
  if (!c.declareMoveIfNone(player.id, action)) return;

  extendRoute(c, start, { x, y });
}

function isStillActing(
  c: GameplayInteractionController,
  playerId: string
): boolean {
  return (
    isTurnRunning(c.gameService.getState()) &&
    !c.gameService.hasPlayerActed(playerId)
  );
}

export function stoppedShort(
  c: GameplayInteractionController,
  playerId: string,
  end: Square
): boolean {
  const now = c.gameService.getPlayerById(playerId);
  return (
    !isStillActing(c, playerId) ||
    now?.status !== PlayerStatus.ACTIVE ||
    now.gridPosition?.x !== end.x ||
    now.gridPosition.y !== end.y
  );
}

export function afterMove(c: GameplayInteractionController, playerId: string): void {
  if (!isStillActing(c, playerId)) {
    if (c.selectedPlayerId === playerId) c.deselectPlayer();
    return;
  }
  c.hasMovedInAction = true;
  c.eventBus.emit(GameEventNames.PlayerMovedInAction, { playerId });
  c.clearWaypoints();
  c.pitch.clearPath();

  refreshPlayerVisualization(c, playerId);
  publishPlan(c);
}

type PlannedLeg = ReturnType<typeof planLegs>[number];

async function legPath(c: GameplayInteractionController, player: Player, leg: PlannedLeg): Promise<MoveStep[] | null> {
  await c.dice.landed();
  if (!("climb" in leg)) return leg.path;
  const square = player.gridPosition;
  if (!square) return null;
  const answer = await c.confirmations.choose("climb", climbRequest({ deps: c, player, square, climb: leg.climb }));
  if (answer === "cancel") return null;
  const [step] = leg.path;
  return [answer === "alternative" ? { ...step, reckless: true } : step];
}

async function takeLeg(c: GameplayInteractionController, player: Player, leg: PlannedLeg): Promise<boolean> {
  if ("jump" in leg) {
    await c.dice.landed();
    const [{ x, y }] = leg.path;
    await c.gameService.jumpPlayer(player.id, { x, y });
    return true;
  }
  const path = await legPath(c, player, leg);
  if (path) await c.gameService.movePlayer(player.id, path);
  return path !== null;
}

export async function walkRoute(c: GameplayInteractionController, playerId: string, route: RouteStep[]): Promise<boolean> {
  let rest = route;
  let walked = false;
  while (rest.length > 0) {
    const player = c.gameService.getPlayerById(playerId);
    if (!player?.gridPosition) break;
    const [leg] = planLegs(c, player, rest);
    if (!leg) break;
    if (!(await takeLeg(c, player, leg))) break;
    walked = true;
    await c.scene.playerSettled?.(playerId);
    const end = leg.path.reduce((_, square) => square, leg.path[0]);
    if (stoppedShort(c, playerId, end)) break;
    rest = rest.slice(leg.path.length);
  }
  return walked;
}

export function refreshPlayerVisualization(
  c: GameplayInteractionController,
  playerId: string
): void {
  const state = c.gameService.getState();
  const player = c.gameService.getPlayerById(playerId);
  if (!player) return;
  const effectivePlayer = withDriveModifiers(player, state);
  syncMovementHalf(c);

  const canActivate = c.gameService.canActivate(playerId);
  const isOwnTurn = state.activeTeamId === player.teamId;
  if (!isOwnTurn || !canActivate) return;

  if (
    c.currentActionMode !== "ballAndChain" &&
    (c.currentActionMode !== "pass" || c.currentStepId === "move")
  ) {
    drawMoveRange(c, player, effectivePlayer);
  } else {
    c.pitch.clearLayer("range_overlay");
    c.pitch.clearLayer("sprint_risk");
  }

  c.pitch.drawTackleZones(
    tackleZoneSquares(c.getOpposingPlayers(player.teamId))
  );
}
