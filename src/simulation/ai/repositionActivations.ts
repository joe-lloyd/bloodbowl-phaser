import { type FieldPlayer as Player } from "./board";
import { PlayerStatus } from "../../types/Player";
import { SkillType, hasSkill } from "../../types/Skills";
import { isRightStuffEligible } from "../../game/rules/throwTeammate";
import {
  type Board,
  HEIGHT,
  type Square,
  WIDTH,
  canCarry,
  carrierOf,
  distance,
  key,
  neighbours,
  onPitch,
  standing,
  toGoal,
} from "./board";
import { type Route } from "./routes";
import { PassController } from "../../game/controllers/PassController";
import { type Context, crowd, gamble, tierFor } from "./activationContext";
import { CORNERS, passRange } from "./ballActivations";
import { passTarget } from "../../game/rules/rollPreview";
import { d6, withReroll } from "./chance";
import type { Activation, Role } from "./activations";
import { moveFeedingCost } from "./feeding";
import { THROW_REACH, throwersFor } from "./teammateActivations";
import {
  exposureCost,
  injuryRiskValue,
  nextTurnReach,
  opponentCanScore,
} from "./latePlans";

export interface RoleSquare {
  role: Role;
  at: Square;
  value: number;

  only?: string;
}

type AddSquare = (square: RoleSquare) => void;

function launchSquares(c: Context, carrier: Player, add: AddSquare): void {
  const { board, w } = c;
  const at = carrier.gridPosition;
  if (
    board.turnsLeft !== 1 ||
    !isRightStuffEligible(carrier) ||
    toGoal(board, at) > THROW_REACH + nextTurnReach(carrier)
  )
    return;
  for (const thrower of throwersFor(board, carrier))
    for (const s of neighbours(at))
      add({ role: "throw", at: s, value: w.launch, only: thrower.id });
}

function flankRunner(c: Context, carrier: Player): Player | undefined {
  const at = carrier.gridPosition;
  const wide = (p: Player) => Math.abs(p.gridPosition.y - at.y) >= 3;
  return c.board.ours
    .filter((p) => p.id !== carrier.id && standing(p) && canCarry(p))
    .sort(
      (a, b) =>
        b.stats.MA - a.stats.MA ||
        Number(wide(b)) - Number(wide(a)) ||
        a.id.localeCompare(b.id)
    )[0];
}

interface FlankPaysArgs {
  board: Board;
  carrier: Player;
  runner: Player;
  s: Square;
}

function flankPays({ board, carrier, runner, s }: FlankPaysArgs): boolean {
  const at = carrier.gridPosition;
  const range = PassController.rangeValue(at, s);
  const reached =
    (carrier.stats.PA > 0 && range !== null && range <= 1) ||
    distance(at, s) <= carrier.stats.MA;
  return reached && toGoal(board, s) <= nextTurnReach(runner);
}

function flankSquares(c: Context, carrier: Player, add: AddSquare): void {
  const { board, w } = c;
  const at = carrier.gridPosition;
  const pressed = crowd(board, at);
  const runner = pressed > 0 ? flankRunner(c, carrier) : undefined;
  if (!runner) return;
  for (const ahead of [0, 1, 2, 3])
    for (let y = 1; y < HEIGHT - 1; y++) {
      if (Math.abs(y - at.y) < 3) continue;
      const s = { x: at.x + board.dir * ahead, y };
      if (
        onPitch(s) &&
        flankPays({ board: board, carrier: carrier, runner: runner, s: s })
      )
        add({
          role: "flank",
          at: s,
          value: w.flank * (pressed - crowd(board, s)),
          only: runner.id,
        });
    }
}

function deepReceiver(c: Context, carrier: Player): Player | undefined {
  const at = carrier.gridPosition;
  const hands = (p: Player) =>
    p.stats.AG - (hasSkill(p.skills, SkillType.CATCH) ? 1 : 0);
  const canGo = (p: Player) =>
    isDeep({ c: c, from: at, s: p.gridPosition, receiver: p }) ??
    [...c.plainRoutes(p).values()].some(
      (r) =>
        r.chance >= c.w.safeMove &&
        isDeep({ c: c, from: at, s: r.to, receiver: p })
    );
  return c.board.ours
    .filter(
      (p) =>
        p.id !== carrier.id &&
        standing(p) &&
        canCarry(p) &&
        !!c.available.get(p.id)?.has("move") &&
        canGo(p)
    )
    .sort(
      (a, b) =>
        hands(a) - hands(b) ||
        b.stats.MA - a.stats.MA ||
        a.id.localeCompare(b.id)
    )[0];
}

function deepSquares(c: Context, carrier: Player, add: AddSquare): void {
  const { board, w } = c;
  const at = carrier.gridPosition;
  if (carrier.stats.PA <= 0 || toGoal(board, at) <= nextTurnReach(carrier))
    return;

  const wentDeep = (p: Player) =>
    p.id !== carrier.id &&
    standing(p) &&
    !c.available.get(p.id)?.has("move") &&
    isDeep({ c: c, from: at, s: p.gridPosition, receiver: p });
  if (board.ours.some(wentDeep)) return;
  const receiver = deepReceiver(c, carrier);
  if (!receiver) return;
  for (let x = 0; x < WIDTH; x++)
    for (let y = 1; y < HEIGHT - 1; y++) {
      const s = { x, y };
      const range = isDeep({ c, from: at, s, receiver });
      if (!range) continue;
      const target = passTarget(carrier, [], board.weather, range);
      const throws = hasSkill(carrier.skills, SkillType.PASS)
        ? withReroll(d6(target))
        : d6(target);
      add({
        role: "deep",
        at: s,
        value: w.deep * throws - w.deepCrowd * crowd(board, s),
        only: receiver.id,
      });
    }
}

interface IsDeepArgs {
  c: Context;
  from: Square;
  s: Square;
  receiver: Player;
}

function isDeep({ c, from, s, receiver }: IsDeepArgs) {
  const run = toGoal(c.board, s);
  const range = passRange(from, s);
  return s.y > 0 &&
    s.y < HEIGHT - 1 &&
    run > 0 &&
    run <= receiver.stats.MA &&
    !!range &&
    range.type !== "Long Bomb"
    ? range
    : null;
}

const TRANSFER_ROLES: ReadonlySet<Role> = new Set(["throw", "flank", "deep"]);

function transferSquares(c: Context, carrier: Player): RoleSquare[] {
  const out: RoleSquare[] = [];
  const add: AddSquare = (square) => out.push(square);
  launchSquares(c, carrier, add);
  flankSquares(c, carrier, add);
  deepSquares(c, carrier, add);
  return out;
}

function cornerWorth(
  c: Context,
  carrier: Player,
  transfer: RoleSquare[]
): number {
  const { board, w } = c;
  const acted = board.gs.getState().turn.activatedPlayerIds;
  const planned = transfer.some(
    (s) =>
      TRANSFER_ROLES.has(s.role) &&
      s.value > 0 &&
      onPitch(s.at) &&
      !(s.only !== undefined && acted.has(s.only))
  );
  return w.cageCorner + (acted.has(carrier.id) && !planned ? w.cageKeep : 0);
}

function ownCarrierSquares(c: Context, carrier: Player, add: AddSquare): void {
  const { board, w } = c;
  const at = carrier.gridPosition;
  const transfer = board.turnsLeft === 0 ? [] : transferSquares(c, carrier);
  const corner = cornerWorth(c, carrier, transfer);
  for (const [dx, dy] of CORNERS)
    add({ role: "cage", at: { x: at.x + dx, y: at.y + dy }, value: corner });

  if (board.turnsLeft === 0) return;
  for (const ahead of [2, 3, 4])
    for (const dy of [-2, 0, 2])
      add({
        role: "receiver",
        at: { x: at.x + board.dir * ahead, y: at.y + dy },
        value: w.receiver,
      });
  for (const s of transfer) add(s);
}

interface CageWallSquaresArgs {
  board: Board;
  at: Square;
  press: number;
  add: AddSquare;
}

function cageWallSquares({ board, at, press, add }: CageWallSquaresArgs): void {
  for (const wall of board.theirs) {
    if (!standing(wall) || distance(wall.gridPosition, at) !== 1) continue;
    for (const s of neighbours(wall.gridPosition))
      if (distance(s, at) > 1) add({ role: "mark", at: s, value: press / 2 });
  }
}

function theirCarrierSquares(c: Context, at: Square, add: AddSquare): void {
  const { board, w } = c;
  const preserve =
    c.goal === "protect" &&
    board.persistentInjuries &&
    !opponentCanScore(board);

  const markers = board.ours.filter(
    (p) => standing(p) && distance(p.gridPosition, at) === 1
  ).length;
  const press = preserve ? 0 : w.markCarrier / (1 + markers);

  if (press > 0) {
    for (const s of neighbours(at))
      add({
        role: "mark",
        at: s,
        value: press + (board.marks.getUint8(key(s)) === 1 ? w.assist : 0),
      });
    cageWallSquares({ board: board, at: at, press: press, add: add });
  }

  for (const depth of [2, 4])
    for (const dy of [-4, -2, 0, 2, 4])
      add({
        role: "screen",
        at: { x: at.x - board.dir * depth, y: at.y + dy },
        value: w.screen - depth * 0.5,
      });
}

export function roleSquares(c: Context): RoleSquare[] {
  const { board, w } = c;
  const out: RoleSquare[] = [];
  const add: AddSquare = ({ role, at, value, only }) => {
    if (onPitch(at) && value > 0)
      out.push(only ? { role, at, value, only } : { role, at, value });
  };
  const ball = board.ball;
  if (ball.kind === "carried" && ball.carrier.teamId === board.us) {
    ownCarrierSquares(c, ball.carrier, add);
  } else if (ball.kind === "carried") {
    theirCarrierSquares(c, ball.at, add);
  } else if (ball.kind === "loose") {
    for (const s of neighbours(ball.at))
      add({ role: "chase", at: s, value: w.chase });
  }
  return out;
}

interface Reposition {
  route: Route;
  gain: number;
  role: Role;
}

interface RoleRouteArgs {
  c: Context;
  player: Player;
  squares: RoleSquare[];
  routes: Map<number, Route>;
}

function roleRoute({
  c,
  player,
  squares,
  routes,
}: RoleRouteArgs): Reposition | null {
  const { board, w } = c;

  const { top, marking } = rolePriorities(player, squares);
  const worth = (at: Square) => {
    const marked = marking.has(key(at)) ? 0 : board.marks.getUint8(key(at));
    return (
      Math.max(0, top.get(key(at))?.value ?? 0) -
      marked * w.endInContact -
      exposureCost(c, player, at)
    );
  };
  const here =
    player.status === PlayerStatus.PRONE
      ? -w.standUp
      : worth(player.gridPosition);
  let best: Reposition | null = null;
  for (const s of top.values()) {
    const route = routes.get(key(s.at));
    if (!route || route.chance < w.safeMove) continue;
    const gain =
      gamble(c, route.chance, worth(s.at) - here) -
      moveFeedingCost(c, player, s.at);
    if (gain > (best?.gain ?? 0.5)) best = { route, gain, role: s.role };
  }
  return best;
}

function chaseRoute(
  c: Context,
  player: Player,
  routes: Map<number, Route>
): Reposition | null {
  const { board, w } = c;
  const target = chaseTarget(c, player);
  if (!target) return null;
  const now = distance(player.gridPosition, target);
  let best: Reposition | null = null;
  for (const route of routes.values()) {
    if (route.chance < w.safeMove || board.marks.getUint8(key(route.to)) > 0)
      continue;
    const gain =
      gamble(c, route.chance, (now - distance(route.to, target)) * 0.5) -
      moveFeedingCost(c, player, route.to);
    if (now > 3 && gain > (best?.gain ?? 0.5))
      best = { route, gain, role: "chase" };
  }
  return best;
}

function standUpActivation(c: Context, player: Player): Activation[] {
  return player.status === PlayerStatus.PRONE &&
    c.available.get(player.id)?.has("standUp")
    ? [
        {
          player,
          action: "standUp",
          intent: { kind: "stand-up" },
          tier: "support",
          value: c.w.standUp,
          rolls: [],
        },
      ]
    : [];
}

export function repositionActivation(
  c: Context,
  player: Player,
  squares: RoleSquare[]
): Activation[] {
  const { board, w } = c;
  const routes = c.plainRoutes(player);
  const isCarrier = carrierOf(board)?.id === player.id;
  if (isCarrier) return [];
  const roles = canCarry(player)
    ? squares
    : squares.filter((s) => s.role !== "receiver");
  const best =
    roleRoute({ c: c, player: player, squares: roles, routes: routes }) ??
    chaseRoute(c, player, routes);
  const withdrawal = withdrawalRoute(c, player, routes);
  const selected =
    withdrawal && withdrawal.gain > (best?.gain ?? 0) ? withdrawal : best;
  if (!selected) return standUpActivation(c, player);
  return [
    {
      player,
      action: "move",
      intent: {
        kind: "reposition",
        role: selected.role,
        route: selected.route,
      },
      tier: tierFor(selected.route.chance, w.safeMove, "support"),
      value: selected.gain,
      rolls: selected.route.rolls,
    },
  ];
}

function withdrawalRoute(
  c: Context,
  player: Player,
  routes: Map<number, Route>
): Reposition | null {
  if (c.goal !== "protect") return null;
  const here = exposureCost(c, player, player.gridPosition);
  if (here === 0) return null;
  let best: Reposition | null = null;
  for (const route of routes.values()) {
    if (route.chance < c.w.safeMove) continue;
    const gain =
      route.chance * (here - exposureCost(c, player, route.to)) -
      (1 - route.chance) * (c.turnover + injuryRiskValue(c, player)) -
      moveFeedingCost(c, player, route.to);
    if (gain > (best?.gain ?? 0)) best = { route, gain, role: "safety" };
  }
  return best;
}

function rolePriorities(player: Player, squares: RoleSquare[]) {
  const top = new Map<number, RoleSquare>();
  const marking = new Set<number>();
  for (const s of squares) {
    if (s.only && s.only !== player.id) continue;
    const best = top.get(key(s.at));
    if (!best || s.value > best.value) top.set(key(s.at), s);
    if (s.role === "mark") marking.add(key(s.at));
  }
  return { top, marking };
}

function chaseTarget(c: Context, player: Player): Square | null {
  const { board } = c;
  if (board.ball.kind === "none" || !standing(player)) return null;
  if (
    board.turnsLeft === 0 &&
    board.ball.kind === "carried" &&
    board.ball.carrier.teamId === board.us
  )
    return null;
  return board.ball.at;
}
