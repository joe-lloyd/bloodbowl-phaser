/**
 * Activations for players away from the ball: take up a role around it,
 * step towards the action, or stand up.
 */

import { Player, PlayerStatus } from "../../types/Player";
import { SkillType, hasSkill } from "../../types/Skills";
import { isRightStuffEligible } from "../../game/rules/throwTeammate";
import {
  Board,
  HEIGHT,
  Square,
  WIDTH,
  carrierOf,
  distance,
  key,
  neighbours,
  onPitch,
  standing,
  toGoal,
} from "./board";
import { Route } from "./routes";
import { PassController } from "../../game/controllers/PassController";
import { Context, crowd, gamble, tierFor } from "./activationContext";
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
  /** The one player the square is worth this to, when not everyone. */
  only?: string;
}

type AddSquare = (role: Role, at: Square, value: number, only?: string) => void;

/**
 * Beside a Right Stuff carrier on the turn before the last: a thrower there
 * can launch it on the last turn.
 */
function launchSquares(c: Context, carrier: Player, add: AddSquare): void {
  const { board, w } = c;
  const at = carrier.gridPosition!;
  if (
    board.turnsLeft !== 1 ||
    !isRightStuffEligible(carrier) ||
    toGoal(board, at) > THROW_REACH + nextTurnReach(carrier)
  )
    return;
  for (const thrower of throwersFor(board, carrier))
    for (const s of neighbours(at)) add("throw", s, w.launch, thrower.id);
}

/**
 * The one team-mate who runs wide: the fastest standing player without the
 * ball, one already wide first. A flank is a runner's job, not the team's.
 */
function flankRunner(c: Context, carrier: Player): Player | undefined {
  const at = carrier.gridPosition!;
  const wide = (p: Player) => Math.abs(p.gridPosition!.y - at.y) >= 3;
  return c.board.ours
    .filter((p) => p.id !== carrier.id && standing(p))
    .sort(
      (a, b) =>
        b.stats.MA - a.stats.MA ||
        Number(wide(b)) - Number(wide(a)) ||
        a.id.localeCompare(b.id)
    )[0];
}

/**
 * Next turn the carrier can get the ball to `s`, by a Quick or Short Pass or
 * by walking up for a hand-off, and the runner can score from there.
 */
function flankPays(
  board: Board,
  carrier: Player,
  runner: Player,
  s: Square
): boolean {
  const at = carrier.gridPosition!;
  const range = PassController.rangeValue(at, s);
  const reached =
    (carrier.stats.PA > 0 && range !== null && range <= 1) ||
    distance(at, s) <= carrier.stats.MA;
  return reached && toGoal(board, s) <= nextTurnReach(runner);
}

/**
 * Wide of our carrier, on the side the defence has left: a runner there
 * takes a sideways ball next turn, scores and splits the defence. Not on a
 * sideline, where a push puts it in the crowd.
 */
function flankSquares(c: Context, carrier: Player, add: AddSquare): void {
  const { board, w } = c;
  const at = carrier.gridPosition!;
  const pressed = crowd(board, at);
  const runner = pressed > 0 ? flankRunner(c, carrier) : undefined;
  if (!runner) return;
  for (const ahead of [0, 1, 2, 3])
    for (let y = 1; y < HEIGHT - 1; y++) {
      if (Math.abs(y - at.y) < 3) continue;
      const s = { x: at.x + board.dir * ahead, y };
      if (onPitch(s) && flankPays(board, carrier, runner, s))
        add("flank", s, w.flank * (pressed - crowd(board, s)), runner.id);
    }
}

/**
 * The one team-mate who goes deep: the surest hands, then the fastest, of
 * those still to act that stand deep or can reach a deep square safely.
 */
function deepReceiver(c: Context, carrier: Player): Player | undefined {
  const at = carrier.gridPosition!;
  const hands = (p: Player) =>
    p.stats.AG - (hasSkill(p.skills, SkillType.CATCH) ? 1 : 0);
  const canGo = (p: Player) =>
    isDeep(c, at, p.gridPosition!, p) ||
    [...c.plainRoutes(p).values()].some(
      (r) => r.chance >= c.w.safeMove && isDeep(c, at, r.to, p)
    );
  return c.board.ours
    .filter(
      (p) =>
        p.id !== carrier.id &&
        standing(p) &&
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

/**
 * The setup turn of a two-step pass. The carrier cannot run the ball in
 * next turn, so one receiver goes deep: within a Long Pass of the carrier,
 * near enough to catch and score next turn without a Rush, away from the
 * defence and off the sidelines. Each square is worth the carrier's chance
 * of completing that throw unmarked, so a lineman's Long Pass sends nobody.
 * Next turn the pass prices the score.
 */
function deepSquares(c: Context, carrier: Player, add: AddSquare): void {
  const { board, w } = c;
  const at = carrier.gridPosition!;
  if (carrier.stats.PA <= 0 || toGoal(board, at) <= nextTurnReach(carrier))
    return;
  // One receiver deep is enough: once a team-mate that has acted stands
  // deep, nobody else goes, though its run opens a route for another.
  const wentDeep = (p: Player) =>
    p.id !== carrier.id &&
    standing(p) &&
    !c.available.get(p.id)?.has("move") &&
    isDeep(c, at, p.gridPosition!, p);
  if (board.ours.some(wentDeep)) return;
  const receiver = deepReceiver(c, carrier);
  if (!receiver) return;
  for (let x = 0; x < WIDTH; x++)
    for (let y = 1; y < HEIGHT - 1; y++) {
      const s = { x, y };
      if (!isDeep(c, at, s, receiver)) continue;
      const range = passRange(at, s)!;
      const target = passTarget(carrier, [], board.weather, range);
      const throws = hasSkill(carrier.skills, SkillType.PASS)
        ? withReroll(d6(target))
        : d6(target);
      add(
        "deep",
        s,
        w.deep * throws - w.deepCrowd * crowd(board, s),
        receiver.id
      );
    }
}

/**
 * A deep square for `receiver`: off the sidelines, short of the end zone
 * but no further than its Movement from it, and in range of a throw from
 * `from` short of a Long Bomb.
 */
function isDeep(c: Context, from: Square, s: Square, receiver: Player) {
  const run = toGoal(c.board, s);
  const range = passRange(from, s);
  return (
    s.y > 0 &&
    s.y < HEIGHT - 1 &&
    run > 0 &&
    run <= receiver.stats.MA &&
    !!range &&
    range.type !== "Long Bomb"
  );
}

/** Our carrier: a cage around it and receivers ahead of it. */
function ownCarrierSquares(c: Context, carrier: Player, add: AddSquare): void {
  const { board, w } = c;
  const at = carrier.gridPosition!;
  for (const [dx, dy] of CORNERS)
    add("cage", { x: at.x + dx, y: at.y + dy }, w.cageCorner);
  // Final-turn receiver preparation must lead to a score. End-zone runs
  // have their own complete transfer plan in deepReceiverActivations.
  if (board.turnsLeft === 0) return;
  for (const ahead of [2, 3, 4])
    for (const dy of [-2, 0, 2])
      add(
        "receiver",
        { x: at.x + board.dir * ahead, y: at.y + dy },
        w.receiver
      );
  launchSquares(c, carrier, add);
  flankSquares(c, carrier, add);
  deepSquares(c, carrier, add);
}

/** Beside the walls of their carrier's cage: assists for the hits that break it. */
function cageWallSquares(
  board: Board,
  at: Square,
  press: number,
  add: AddSquare
): void {
  for (const wall of board.theirs) {
    if (!standing(wall) || distance(wall.gridPosition!, at) !== 1) continue;
    for (const s of neighbours(wall.gridPosition!))
      if (distance(s, at) > 1) add("mark", s, press / 2);
  }
}

/** Their carrier: marks on it and its cage, and a screen in front of our end zone. */
function theirCarrierSquares(c: Context, at: Square, add: AddSquare): void {
  const { board, w } = c;
  const preserve =
    c.goal === "protect" &&
    board.persistentInjuries &&
    !opponentCanScore(board);
  // A marker or two presses the carrier; a crowd only hands out free hits.
  const markers = board.ours.filter(
    (p) => standing(p) && distance(p.gridPosition!, at) === 1
  ).length;
  const press = preserve ? 0 : w.markCarrier / (1 + markers);
  // A square nobody else marks assists a hit; re-planning each step must
  // keep a helper heading there.
  if (press > 0) {
    for (const s of neighbours(at))
      add("mark", s, press + (board.marks[key(s)] === 1 ? w.assist : 0));
    cageWallSquares(board, at, press, add);
  }
  // A screen between the carrier and our end zone, two squares apart.
  for (const depth of [2, 4])
    for (const dy of [-4, -2, 0, 2, 4])
      add(
        "screen",
        { x: at.x - board.dir * depth, y: at.y + dy },
        w.screen - depth * 0.5
      );
}

/** Squares worth standing on for a player without the ball, by role. */
export function roleSquares(c: Context): RoleSquare[] {
  const { board, w } = c;
  const out: RoleSquare[] = [];
  const add: AddSquare = (role, at, value, only) => {
    if (onPitch(at) && value > 0)
      out.push(only ? { role, at, value, only } : { role, at, value });
  };
  const ball = board.ball;
  if (ball.kind === "carried" && ball.carrier.teamId === board.us) {
    ownCarrierSquares(c, ball.carrier, add);
  } else if (ball.kind === "carried") {
    theirCarrierSquares(c, ball.at, add);
  } else if (ball.kind === "loose") {
    for (const s of neighbours(ball.at)) add("chase", s, w.chase);
  }
  return out;
}

type Reposition = { route: Route; gain: number; role: Role };

/** The role square the player gains most by reaching safely. */
function roleRoute(
  c: Context,
  player: Player,
  squares: RoleSquare[],
  routes: Map<number, Route>
): Reposition | null {
  const { board, w } = c;
  // Each square counts for the most this player can make of it there. A
  // square that marks their carrier or its cage is meant to be in contact.
  const top = new Map<number, RoleSquare>();
  const marking = new Set<number>();
  for (const s of squares) {
    if (s.only && s.only !== player.id) continue;
    const best = top.get(key(s.at));
    if (!best || s.value > best.value) top.set(key(s.at), s);
    if (s.role === "mark") marking.add(key(s.at));
  }
  const worth = (at: Square) => {
    const marked = marking.has(key(at)) ? 0 : board.marks[key(at)];
    return (
      Math.max(0, top.get(key(at))?.value ?? 0) -
      marked * w.endInContact -
      exposureCost(c, player, at)
    );
  };
  const here =
    player.status === PlayerStatus.PRONE
      ? -w.standUp
      : worth(player.gridPosition!);
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

/** Nothing useful to reach: step towards the action. */
function chaseRoute(
  c: Context,
  player: Player,
  routes: Map<number, Route>
): Reposition | null {
  const { board, w } = c;
  if (board.ball.kind === "none" || !standing(player)) return null;
  if (
    board.turnsLeft === 0 &&
    board.ball.kind === "carried" &&
    board.ball.carrier.teamId === board.us
  )
    return null;
  const target = board.ball.at;
  const now = distance(player.gridPosition!, target);
  let best: Reposition | null = null;
  for (const route of routes.values()) {
    if (route.chance < w.safeMove || board.marks[key(route.to)] > 0) continue;
    const gain =
      (now - distance(route.to, target)) * 0.5 -
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
  const best =
    roleRoute(c, player, squares, routes) ?? chaseRoute(c, player, routes);
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

/** Leaving unnecessary contact can be worth a scarce late-half activation. */
function withdrawalRoute(
  c: Context,
  player: Player,
  routes: Map<number, Route>
): Reposition | null {
  if (c.goal !== "protect") return null;
  const here = exposureCost(c, player, player.gridPosition!);
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
