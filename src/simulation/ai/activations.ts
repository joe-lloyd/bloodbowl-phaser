/**
 * Whole activations: which player does what, where to, and how much it is
 * worth, in the risk order Bot Bowl's scripted winners play a turn in.
 *
 * Nothing persists between decisions. Each decision reads the board again
 * and re-derives the list; a player already acting continues with the best
 * activation its declared action still allows. A path is re-planned from
 * the square the player now stands on, so a step that went to plan keeps
 * the same target and a surprise (a push, a bounce) picks a new one.
 */

import { Player, PlayerStatus } from "../../types/Player";
import { ActionType } from "../../types/events";
import { BlockValidator } from "../../game/validators/BlockValidator";
import {
  catchTarget,
  interceptTarget,
  passTarget,
} from "../../game/rules/rollPreview";
import {
  PassController,
  PassRange,
  PassType,
} from "../../game/controllers/PassController";
import {
  Board,
  HEIGHT,
  Square,
  carrierOf,
  distance,
  key,
  neighbours,
  onPitch,
  standing,
  toGoal,
} from "./board";
import {
  CERTAIN,
  Chance,
  RollTarget,
  blockOdds,
  both,
  d6,
  withReroll,
} from "./chance";
import { Route, movesLeft, routesFor, withTeamReroll } from "./routes";
import { Weights } from "./weights";

/** Botbowl's turn order: the earlier a tier, the safer its actions. */
export const TIERS = [
  "score",
  "handoff",
  "carrier",
  "sure-block",
  "pickup",
  "assist",
  "blitz",
  "support",
  "risky",
] as const;
export type Tier = (typeof TIERS)[number];

export type Role = "cage" | "receiver" | "mark" | "screen" | "chase" | "stall";

export type Intent =
  | { kind: "score"; route: Route }
  | { kind: "carrier"; route: Route }
  | { kind: "pickup"; route: Route }
  | { kind: "handoff"; to: Player; route: Route | null }
  | { kind: "pass"; to: Player; route: Route | null }
  | { kind: "block"; target: Player }
  | { kind: "blitz"; target: Player; route: Route | null }
  | { kind: "reposition"; role: Role; route: Route }
  | { kind: "stand-up" };

export interface Activation {
  player: Player;
  /** The action to declare for it. */
  action: ActionType;
  intent: Intent;
  tier: Tier;
  value: number;
  /** The rolls it needs, for the recording's note. */
  rolls: RollTarget[];
}

/** What the engine lets each of our players declare right now. */
export type Available = ReadonlyMap<string, ReadonlySet<ActionType>>;

const blockValidator = new BlockValidator();

interface Context {
  board: Board;
  w: Weights;
  available: Available;
  teamReroll: boolean;
  /** Cost of a turnover now: the activations it would throw away. */
  turnover: number;
  /**
   * How much each square of progress counts: 1, rising to 3 when the ball
   * must move faster than four squares a turn to score this half.
   */
  urgency: number;
  /** Paths for a play worth a team re-roll: scoring, the ball, a blitz. */
  routes: (p: Player) => Map<number, Route>;
  /**
   * Paths for positioning, judged without the team re-roll: a re-roll spent
   * on a cage corner is not there for the pick-up.
   */
  plainRoutes: (p: Player) => Map<number, Route>;
}

function context(board: Board, w: Weights, available: Available): Context {
  const teamReroll = board.rerolls > 0;
  // A player's paths do not depend on the re-roll, only their chances do.
  const plainCache = new Map<string, Map<number, Route>>();
  const rerollCache = new Map<string, Map<number, Route>>();
  const plainRoutes = (p: Player) => {
    let routes = plainCache.get(p.id);
    if (!routes) plainCache.set(p.id, (routes = routesFor(board, p)));
    return routes;
  };
  const rerollRoutes = (p: Player) => {
    let routes = rerollCache.get(p.id);
    if (!routes)
      rerollCache.set(p.id, (routes = withTeamReroll(plainRoutes(p), p)));
    return routes;
  };
  const ballAt = board.ball.kind === "none" ? null : board.ball.at;
  const pace = ballAt ? toGoal(board, ballAt) / (board.turnsLeft + 1) : 0;
  return {
    board,
    w,
    available,
    teamReroll,
    urgency: Math.min(3, Math.max(1, pace / 4)),
    turnover:
      w.turnoverBase + w.turnoverPerPlayer * Math.max(0, available.size - 1),
    routes: teamReroll ? rerollRoutes : plainRoutes,
    plainRoutes,
  };
}

/**
 * Value of a gamble: win `gain` with chance `p`; else the turn is over and
 * our player is on the ground.
 */
const gamble = (c: Context, p: number, gain: number) =>
  p * gain - (1 - p) * (c.turnover + c.w.ownDown);

const tierFor = (p: Chance, threshold: number, safe: Tier): Tier =>
  p >= threshold ? safe : "risky";

/** Opponents who could reach a square next turn and hit whoever is there. */
function threats(board: Board, at: Square): number {
  return board.theirs.filter(
    (o) =>
      o.status !== PlayerStatus.STUNNED &&
      distance(o.gridPosition!, at) <= o.stats.MA + 3
  ).length;
}

/**
 * How good a square is for our carrier to end on: closer to the end zone,
 * unmarked, out of reach, and with corners team-mates hold or can still
 * reach safely this turn.
 */
function carrierSquare(c: Context, at: Square, carrier: Player): number {
  const { board, w } = c;
  const helpers = board.ours.filter(
    (p) => p.id !== carrier.id && standing(p) && c.available.has(p.id)
  );
  const used = new Set<string>();
  let cage = 0;
  for (const dx of [-1, 1])
    for (const dy of [-1, 1]) {
      const corner = { x: at.x + dx, y: at.y + dy };
      if (!onPitch(corner)) continue;
      const there = board.occupant[key(corner)];
      if (there) {
        if (
          there.teamId === board.us &&
          standing(there) &&
          there.id !== carrier.id
        )
          cage++;
        continue;
      }
      const helper = helpers.find(
        (p) =>
          !used.has(p.id) &&
          (c.plainRoutes(p).get(key(corner))?.chance ?? 0) >= w.safeMove
      );
      if (helper) {
        used.add(helper.id);
        cage += 1;
      }
    }
  // A cage covers the carrier: corners block four of the eight squares
  // next to it and put tackle zones on the other four.
  const exposed = cage >= 3 ? 0 : 1 - cage / 4;
  const edge = Math.min(at.y, HEIGHT - 1 - at.y);
  return (
    -toGoal(board, at) * w.advance * c.urgency -
    board.marks[key(at)] * w.carrierMarked -
    threats(board, at) * w.carrierThreat * exposed +
    Math.min(cage, 4) * w.cageCorner -
    (edge === 0 ? w.sideline : edge === 1 ? w.sideline / 3 : 0)
  );
}

// ===== Generators, one per kind of activation =====

function carrierActivations(c: Context, carrier: Player): Activation[] {
  const { board, w } = c;
  const out: Activation[] = [];
  const routes = c.routes(carrier);
  const plain = c.plainRoutes(carrier);
  const scoring = [...routes.values()].filter((r) => toGoal(board, r.to) === 0);
  const bestScore = scoring.sort((a, b) => b.chance - a.chance)[0];
  const stall = stallRoute(c, carrier, plain);
  if (bestScore && !stall) {
    const late = board.turnsLeft === 0;
    const value =
      gamble(c, bestScore.chance, w.touchdown) -
      (1 - bestScore.chance) * w.ballLoss;
    // A carrier already on its way keeps running while the run is worth
    // it: an opening dodge that spent the re-roll must not turn the rest
    // of the run into a reason to step back.
    const underway =
      board.gs.getMovementUsed(carrier.id) > 0 &&
      board.gs.getState().activePlayer?.id === carrier.id;
    out.push({
      player: carrier,
      action: "move",
      intent: { kind: "score", route: bestScore },
      tier:
        late || (underway && value > 0)
          ? "score"
          : tierFor(bestScore.chance, w.safeScore, "score"),
      value,
      rolls: bestScore.rolls,
    });
  }
  // Move the carrier to a better square: safely if it can, or, when only
  // a risky route gains, as a risky action paid for with the ball.
  const here = carrierSquare(c, carrier.gridPosition!, carrier);
  const from = carrier.gridPosition!;
  const marked = board.marks[key(from)] > 0;
  let safe: { route: Route; value: number } | null = stall
    ? { route: stall, value: w.touchdown * 0.5 }
    : null;
  let risky: { route: Route; value: number } | null = null;
  if (!stall)
    for (const route of [...plain.values(), ...routes.values()]) {
      if (toGoal(board, route.to) === 0) continue;
      // Never run the ball back, unless it is escaping a tackle zone.
      const back = toGoal(board, route.to) - toGoal(board, from);
      if (back > (marked ? 2 : 0)) continue;
      const gain = carrierSquare(c, route.to, carrier) - here;
      const value =
        gamble(c, route.chance, gain) - (1 - route.chance) * w.ballLoss;
      if (route.chance >= w.safeMove && plain.get(key(route.to)) === route) {
        if (gain > 0.5 && value > (safe?.value ?? 0)) safe = { route, value };
      } else if (value > (risky?.value ?? 0)) risky = { route, value };
    }
  for (const [pick, tier] of [
    [safe, "carrier"],
    [risky, "risky"],
  ] as const)
    if (pick)
      out.push({
        player: carrier,
        action: "move",
        intent: { kind: "carrier", route: pick.route },
        tier,
        value: pick.value,
        rolls: pick.route.rolls,
      });
  return out;
}

/**
 * On one of the last turns of a half, a carrier who could score now and
 * can wait safely within reach of the end zone waits, so the other side
 * gets no time to answer.
 */
function stallRoute(
  c: Context,
  carrier: Player,
  routes: Map<number, Route>
): Route | null {
  const { board } = c;
  if (board.turnsLeft === 0 || board.turnsLeft > 2) return null;
  const reach = carrier.stats.MA;
  const here = { route: null as Route | null, at: carrier.gridPosition! };
  const options = [
    here,
    ...[...routes.values()].map((route) => ({ route, at: route.to })),
  ].filter(
    ({ route, at }) =>
      (!route || route.chance >= 0.99) &&
      toGoal(board, at) > 0 &&
      toGoal(board, at) <= reach - 1 &&
      board.marks[key(at)] === 0 &&
      threats(board, at) === 0
  );
  if (options.length === 0) return null;
  // Wait where opponents are furthest away, off the sideline. Staying put
  // is a stall too; a route of no steps says so.
  const safety = (at: Square) =>
    Math.min(99, ...board.theirs.map((o) => distance(o.gridPosition!, at))) +
    Math.min(2, at.y, HEIGHT - 1 - at.y);
  const pick = options.reduce((best, o) =>
    safety(o.at) > safety(best.at) ? o : best
  );
  return (
    pick.route ?? { to: pick.at, path: [], rolls: [], chance: 1 as Chance }
  );
}

/** The best chance a player has of running in a touchdown from here. */
function scoreChanceOf(c: Context, player: Player): number {
  let best = 0;
  for (const r of c.routes(player).values())
    if (toGoal(c.board, r.to) === 0) best = Math.max(best, r.chance);
  return best;
}

/**
 * Before the carrier acts, a team-mate who can safely reach an open end
 * zone square within passing range goes there to catch a scoring pass.
 */
function deepReceiverActivations(c: Context, carrier: Player): Activation[] {
  const { board, w } = c;
  if (!c.available.get(carrier.id)?.has("pass")) return [];
  const from = carrier.gridPosition!;
  const out: Activation[] = [];
  for (const mate of board.ours) {
    if (mate.id === carrier.id || !standing(mate)) continue;
    if (!c.available.get(mate.id)?.has("move")) continue;
    if (toGoal(board, mate.gridPosition!) === 0) continue;
    let best: Route | null = null;
    for (const route of c.plainRoutes(mate).values()) {
      const range = PassController.rangeValue(from, route.to);
      if (toGoal(board, route.to) !== 0 || range === null || range > 2)
        continue;
      if (route.chance < w.safeMove || board.marks[key(route.to)] > 0) continue;
      if (!best || route.chance > best.chance) best = route;
    }
    if (!best) continue;
    out.push({
      player: mate,
      action: "move",
      intent: { kind: "reposition", role: "receiver", route: best },
      tier: "handoff",
      value: gamble(c, best.chance, w.touchdown * 0.4),
      rolls: best.rolls,
    });
  }
  return out.sort((a, b) => b.value - a.value).slice(0, 1);
}

/** The furthest forward a player can safely get from where it stands. */
function bestReach(c: Context, player: Player): number {
  let best = toGoal(c.board, player.gridPosition!);
  for (const route of c.plainRoutes(player).values())
    if (route.chance >= c.w.safeMove)
      best = Math.min(best, toGoal(c.board, route.to));
  return best;
}

/**
 * Hand the ball to a team-mate who has not acted yet: one who can then
 * score, or one who can carry it further than the carrier can.
 */
function handoffActivations(c: Context, carrier: Player): Activation[] {
  const { board, w } = c;
  if (!c.available.get(carrier.id)?.has("handoff")) return [];
  const out: Activation[] = [];
  const routes = c.routes(carrier);
  const carrierReach = bestReach(c, carrier);
  for (const mate of board.ours) {
    if (mate.id === carrier.id || !standing(mate) || !c.available.has(mate.id))
      continue;
    const scoreChance = scoreChanceOf(c, mate);
    const progress =
      (carrierReach - bestReach(c, mate)) * w.advance * c.urgency;
    if (scoreChance === 0 && progress < w.advance * 2) continue;
    const target = catchTarget(mate, board.theirs, board.weather, "handoff");
    const catchP = c.teamReroll ? withReroll(d6(target)) : d6(target);
    // Get next to the receiver first, unless already there.
    const adjacent = distance(carrier.gridPosition!, mate.gridPosition!) === 1;
    const approach = adjacent
      ? null
      : neighbours(mate.gridPosition!)
          .map((s) => routes.get(key(s)))
          .filter((r): r is Route => !!r)
          .sort((a, b) => b.chance - a.chance)[0];
    if (!adjacent && !approach) continue;
    const reach = both(approach?.chance ?? CERTAIN, catchP);
    const scoring = scoreChance > 0;
    const chance = scoring ? both(reach, scoreChance as Chance) : reach;
    const gain = scoring ? w.touchdown : progress;
    out.push({
      player: carrier,
      action: "handoff",
      intent: { kind: "handoff", to: mate, route: approach ?? null },
      tier: tierFor(chance, scoring ? w.safeScore : w.safeMove, "handoff"),
      value: gamble(c, chance, gain) - (1 - reach) * w.ballLoss - 1,
      rolls: [...(approach?.rolls ?? []), { kind: "catch", target }],
    });
  }
  return out;
}

const PASS_TYPES: readonly PassType[] = [
  "Quick Pass",
  "Short Pass",
  "Long Pass",
  "Long Bomb",
];

/** The pass range from one square to another, or null out of range. */
function passRange(from: Square, to: Square): PassRange | null {
  const value = PassController.rangeValue(from, to);
  if (value === null) return null;
  return {
    type: PASS_TYPES[value],
    modifier: -value,
    minDistance: 0,
    maxDistance: 0,
  };
}

/** Distance from `p` to the segment a-b, in squares. */
function offLine(p: Square, a: Square, b: Square): number {
  const [dx, dy] = [b.x - a.x, b.y - a.y];
  const length = dx * dx + dy * dy;
  const t = length
    ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length))
    : 0;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/**
 * Throw to a team-mate who has not acted yet: one who can then score, or
 * one well downfield. The thrower may first walk, safely, to a better
 * square to throw from.
 */
function passActivations(c: Context, carrier: Player): Activation[] {
  const { board, w } = c;
  if (!c.available.get(carrier.id)?.has("pass")) return [];
  const throwFrom: (Route | null)[] = [
    null,
    ...[...c.plainRoutes(carrier).values()].filter(
      (r) => r.chance >= w.safeMove
    ),
  ];
  const carrierReach = bestReach(c, carrier);
  const out: Activation[] = [];
  for (const mate of board.ours) {
    if (mate.id === carrier.id || !standing(mate)) continue;
    const to = mate.gridPosition!;
    // A catch in the end zone scores; elsewhere the receiver must still
    // have its own activation to run the ball in or on.
    const inEndZone = toGoal(board, to) === 0;
    if (!inEndZone && !c.available.has(mate.id)) continue;
    const scoreChance = inEndZone ? 1 : scoreChanceOf(c, mate);
    const progress =
      (carrierReach - bestReach(c, mate)) * w.advance * c.urgency;
    if (scoreChance === 0 && progress < w.advance * 4) continue;
    const catchRoll = catchTarget(mate, board.theirs, board.weather, "pass");
    const catchP = c.teamReroll ? withReroll(d6(catchRoll)) : d6(catchRoll);
    let best: {
      route: Route | null;
      chance: number;
      rolls: RollTarget[];
    } | null = null;
    for (const route of throwFrom) {
      const from = route?.to ?? carrier.gridPosition!;
      const range = passRange(from, to);
      if (!range || from === to) continue;
      const thrower = { ...carrier, gridPosition: from };
      const throwRoll = passTarget(thrower, board.theirs, board.weather, range);
      // Each standing opponent near the line may try to intercept.
      const intercepted = board.theirs
        .filter(
          (o) =>
            standing(o) &&
            offLine(o.gridPosition!, from, to) <= 1 &&
            distance(o.gridPosition!, from) > 0
        )
        .reduce(
          (p, o) =>
            p * (1 - d6(interceptTarget(o, -3, board.ours, board.weather))),
          1
        );
      const chance =
        (route?.chance ?? 1) * d6(throwRoll) * intercepted * catchP;
      if (!best || chance > best.chance)
        best = {
          route,
          chance,
          rolls: [
            ...(route?.rolls ?? []),
            { kind: "catch", target: catchRoll },
          ],
        };
    }
    if (!best) continue;
    const scoring = scoreChance > 0;
    const chance = scoring ? best.chance * scoreChance : best.chance;
    out.push({
      player: carrier,
      action: "pass",
      intent: { kind: "pass", to: mate, route: best.route },
      tier: tierFor(
        chance as Chance,
        scoring ? w.safeScore : w.safeMove,
        "handoff"
      ),
      value:
        gamble(c, chance, scoring ? w.touchdown : progress) -
        (1 - best.chance) * w.ballLoss -
        2,
      rolls: best.rolls,
    });
  }
  return out;
}

/** How much knocking this opponent down is worth. */
function targetValue(c: Context, target: Player): number {
  const { board, w } = c;
  const carrier = carrierOf(board);
  if (carrier?.id === target.id) return w.carrierKnockdown;
  const near = carrier
    ? distance(target.gridPosition!, carrier.gridPosition!)
    : 99;
  // Near our carrier: a threat to it. Next to theirs: a cage wall that,
  // once down, opens the carrier to the next hit.
  const bonus =
    carrier?.teamId === board.us
      ? near <= 2
        ? w.knockdown
        : 0
      : near === 1
        ? w.cageBreak
        : 0;
  return w.knockdown + bonus + target.stats.ST;
}

/** The odds of `attacker` blocking `target` from square `from`. */
/**
 * The odds of `attacker` blocking `target` from square `from`. Only a hit
 * on the ball carrier is worth the team re-roll; other blocks are judged
 * on the dice alone.
 */
function blockFrom(
  c: Context,
  attacker: Player,
  target: Player,
  from: Square,
  helper?: { player: Player; at: Square }
) {
  const moved = { ...attacker, gridPosition: from };
  const players = c.board.everyone.map((p) =>
    p.id === attacker.id
      ? moved
      : p.id === helper?.player.id
        ? { ...p, gridPosition: helper.at }
        : p
  );
  const analysis = blockValidator.analyzeBlock(
    moved,
    target,
    players,
    c.board.us
  );
  const reroll = c.teamReroll && carrierOf(c.board)?.id === target.id;
  return blockOdds(
    moved,
    target,
    analysis.diceCount,
    !analysis.isUphill,
    reroll
  );
}

function blockActivations(c: Context, player: Player): Activation[] {
  const { board, w } = c;
  if (!standing(player)) return [];
  const out: Activation[] = [];
  for (const target of board.theirs) {
    if (
      !standing(target) ||
      distance(target.gridPosition!, player.gridPosition!) !== 1
    )
      continue;
    const odds = blockFrom(c, player, target, player.gridPosition!);
    const value =
      odds.knockdown * targetValue(c, target) -
      odds.attackerDown * (c.turnover + w.ownDown);
    if (value <= 0) continue;
    out.push({
      player,
      action: "block",
      intent: { kind: "block", target },
      tier: 1 - odds.attackerDown >= w.sureBlock ? "sure-block" : "risky",
      value,
      rolls: [],
    });
  }
  return out;
}

function blitzActivations(c: Context, player: Player): Activation[] {
  const { board, w } = c;
  const out: Activation[] = [];
  const routes = c.routes(player);
  const [normal, rushes] = movesLeft(board, player);
  for (const target of board.theirs) {
    if (!standing(target)) continue;
    const carrier = carrierOf(board);
    const isCarrier = carrier?.id === target.id;
    // A player beside the opposing carrier is a wall of its cage.
    const wallOfCage =
      !!carrier &&
      carrier.teamId !== board.us &&
      !isCarrier &&
      distance(target.gridPosition!, carrier.gridPosition!) === 1;
    let best: { route: Route | null; value: number; chance: number } | null =
      null;
    const adjacentNow =
      distance(target.gridPosition!, player.gridPosition!) === 1;
    const froms: (Route | null)[] = adjacentNow ? [null] : [];
    for (const s of neighbours(target.gridPosition!)) {
      const route = routes.get(key(s));
      // The block itself costs a square of movement.
      if (route && route.path.length < normal + rushes) froms.push(route);
    }
    for (const route of froms) {
      const from = route?.to ?? player.gridPosition!;
      const odds = blockFrom(c, player, target, from);
      const reach =
        (route?.chance ?? 1) *
        (route && route.path.length >= normal ? d6(2) : 1);
      const chance = reach * (1 - odds.attackerDown);
      const value =
        reach * odds.knockdown * targetValue(c, target) -
        (1 - chance) * (c.turnover + w.ownDown);
      if (!best || value > best.value) best = { route, value, chance };
    }
    if (!best || best.value <= 0) continue;
    out.push({
      player,
      action: "blitz",
      intent: { kind: "blitz", target, route: best.route },
      tier:
        isCarrier || wallOfCage || best.chance >= w.sureBlock
          ? "blitz"
          : "risky",
      value: best.value,
      rolls: best.route?.rolls ?? [],
    });
  }
  return out;
}

/**
 * Free moves that give the best hit on their carrier a better die, made
 * before it is thrown. A square beside the carrier only assists if nobody
 * else marks it.
 */
function assistActivations(c: Context, hits: Activation[]): Activation[] {
  const { board, w } = c;
  const carrier = carrierOf(board);
  if (!carrier || carrier.teamId === board.us) return [];
  let hit: Activation | null = null;
  for (const a of hits) {
    const aimed =
      a.intent.kind === "block" || a.intent.kind === "blitz"
        ? a.intent.target.id === carrier.id
        : false;
    if (aimed && (!hit || a.value > hit.value)) hit = a;
  }
  if (!hit || (hit.intent.kind !== "block" && hit.intent.kind !== "blitz"))
    return [];
  const from =
    (hit.intent.kind === "blitz" ? hit.intent.route?.to : null) ??
    hit.player.gridPosition!;
  const before = blockFrom(c, hit.player, carrier, from);
  const out: Activation[] = [];
  for (const player of board.ours) {
    if (player.id === hit.player.id || !c.available.get(player.id)?.has("move"))
      continue;
    const routes = c.plainRoutes(player);
    let best: { route: Route; gain: number } | null = null;
    for (const at of neighbours(carrier.gridPosition!)) {
      if (board.marks[key(at)] !== 1 || (at.x === from.x && at.y === from.y))
        continue;
      const route = routes.get(key(at));
      if (!route || route.chance < w.safeMove) continue;
      const odds = blockFrom(c, hit.player, carrier, from, { player, at });
      const gain =
        (odds.knockdown - before.knockdown) * w.carrierKnockdown +
        (before.attackerDown - odds.attackerDown) * c.turnover;
      if (gain > (best?.gain ?? 0)) best = { route, gain };
    }
    if (best)
      out.push({
        player,
        action: "move",
        intent: { kind: "reposition", role: "mark", route: best.route },
        tier: "assist",
        value: best.gain,
        rolls: best.route.rolls,
      });
  }
  return out;
}

function pickupActivation(c: Context, player: Player): Activation[] {
  const { board, w } = c;
  if (board.ball.kind !== "loose") return [];
  const route = c.routes(player).get(key(board.ball.at));
  if (!route) return [];
  return [
    {
      player,
      action: "move",
      intent: { kind: "pickup", route },
      tier: tierFor(route.chance, w.pickupMin, "pickup"),
      value: gamble(c, route.chance, w.pickup),
      rolls: route.rolls,
    },
  ];
}

/** Squares worth standing on for a player without the ball, by role. */
function roleSquares(c: Context): { role: Role; at: Square; value: number }[] {
  const { board, w } = c;
  const out: { role: Role; at: Square; value: number }[] = [];
  const add = (role: Role, at: Square, value: number) => {
    if (onPitch(at)) out.push({ role, at, value });
  };
  const ball = board.ball;
  if (ball.kind === "carried" && ball.carrier.teamId === board.us) {
    const at = ball.at;
    for (const dx of [-1, 1])
      for (const dy of [-1, 1])
        add("cage", { x: at.x + dx, y: at.y + dy }, w.cageCorner);
    for (const ahead of [2, 3, 4])
      for (const dy of [-2, 0, 2])
        add(
          "receiver",
          { x: at.x + board.dir * ahead, y: at.y + dy },
          w.receiver
        );
  } else if (ball.kind === "carried") {
    const at = ball.at;
    // A marker or two presses the carrier; a crowd only hands out free hits.
    const markers = board.ours.filter(
      (p) => standing(p) && distance(p.gridPosition!, at) === 1
    ).length;
    const press = w.markCarrier / (1 + markers);
    // A square nobody else marks assists a hit; re-planning each step must
    // keep a helper heading there.
    for (const s of neighbours(at))
      add("mark", s, press + (board.marks[key(s)] === 1 ? w.assist : 0));
    // Beside the walls of its cage: assists for the hits that break it.
    for (const wall of board.theirs)
      if (standing(wall) && distance(wall.gridPosition!, at) === 1)
        for (const s of neighbours(wall.gridPosition!))
          if (distance(s, at) > 1) add("mark", s, press / 2);
    // A screen between the carrier and our end zone, two squares apart.
    for (const depth of [2, 4])
      for (const dy of [-4, -2, 0, 2, 4])
        add(
          "screen",
          { x: at.x - board.dir * depth, y: at.y + dy },
          w.screen - depth * 0.5
        );
  } else if (ball.kind === "loose") {
    for (const s of neighbours(ball.at)) add("chase", s, w.chase);
  }
  return out;
}

function repositionActivation(
  c: Context,
  player: Player,
  squares: { role: Role; at: Square; value: number }[]
): Activation[] {
  const { board, w } = c;
  const routes = c.plainRoutes(player);
  const isCarrier = carrierOf(board)?.id === player.id;
  if (isCarrier) return [];
  const worth = (at: Square) => {
    const base = Math.max(
      0,
      ...squares
        .filter((s) => s.at.x === at.x && s.at.y === at.y)
        .map((s) => s.value)
    );
    const marked = board.marks[key(at)];
    const role = squares.find((s) => s.at.x === at.x && s.at.y === at.y)?.role;
    return base - (role === "mark" ? 0 : marked * w.endInContact);
  };
  const here =
    player.status === PlayerStatus.PRONE
      ? -w.standUp
      : worth(player.gridPosition!);
  let best: { route: Route; gain: number; role: Role } | null = null;
  for (const s of squares) {
    const route = routes.get(key(s.at));
    if (!route || route.chance < w.safeMove) continue;
    const gain = gamble(c, route.chance, worth(s.at) - here);
    if (gain > (best?.gain ?? 0.5)) best = { route, gain, role: s.role };
  }
  // Nothing useful to reach: step towards the action.
  if (!best && board.ball.kind !== "none" && standing(player)) {
    const target = board.ball.at;
    const now = distance(player.gridPosition!, target);
    for (const route of routes.values()) {
      if (route.chance < w.safeMove || board.marks[key(route.to)] > 0) continue;
      const gain = (now - distance(route.to, target)) * 0.5;
      if (now > 3 && gain > (best?.gain ?? 0.5))
        best = { route, gain, role: "chase" };
    }
  }
  if (!best) {
    return player.status === PlayerStatus.PRONE &&
      c.available.get(player.id)?.has("standUp")
      ? [
          {
            player,
            action: "standUp",
            intent: { kind: "stand-up" },
            tier: "support",
            value: w.standUp,
            rolls: [],
          },
        ]
      : [];
  }
  return [
    {
      player,
      action: "move",
      intent: { kind: "reposition", role: best.role, route: best.route },
      tier: tierFor(best.route.chance, w.safeMove, "support"),
      value: best.gain,
      rolls: best.route.rolls,
    },
  ];
}

function sortActivations(list: Activation[]): Activation[] {
  return list.sort(
    (a, b) =>
      TIERS.indexOf(a.tier) - TIERS.indexOf(b.tier) ||
      b.value - a.value ||
      a.player.id.localeCompare(b.player.id)
  );
}

/** Everything one player could usefully do, given what it may declare. */
function forPlayer(
  c: Context,
  player: Player,
  actions: ReadonlySet<ActionType>
): Activation[] {
  const { board } = c;
  const out: Activation[] = [];
  const carrier = carrierOf(board);
  if (carrier?.id === player.id) {
    if (actions.has("move")) out.push(...carrierActivations(c, player));
    if (actions.has("handoff")) out.push(...handoffActivations(c, player));
    if (actions.has("pass")) out.push(...passActivations(c, player));
  } else {
    if (actions.has("move") || actions.has("blitz") || actions.has("handoff"))
      out.push(
        ...pickupActivation(c, player).map((a) => ({
          ...a,
          action: actions.has("move")
            ? a.action
            : actions.has("blitz")
              ? "blitz"
              : "handoff",
        }))
      );
    if (actions.has("block")) out.push(...blockActivations(c, player));
    if (actions.has("blitz")) out.push(...blitzActivations(c, player));
    if (actions.has("move") || actions.has("standUp"))
      out.push(...repositionActivation(c, player, roleSquares(c)));
  }
  return out.filter((a) => actions.has(a.action) && a.value > 0);
}

/** Every useful activation for players who have not acted, best first. */
export function activations(
  board: Board,
  w: Weights,
  available: Available
): Activation[] {
  const c = context(board, w, available);
  const out: Activation[] = [];
  for (const player of board.ours) {
    const actions = available.get(player.id);
    if (actions) out.push(...forPlayer(c, player, actions));
  }
  const carrier = carrierOf(board);
  if (carrier?.teamId === board.us && scoreChanceOf(c, carrier) < w.safeScore)
    out.push(...deepReceiverActivations(c, carrier));
  out.push(...assistActivations(c, out));
  return sortActivations(out);
}

/**
 * What the active player should keep doing under the action it declared,
 * or null to end its activation.
 */
export function continuation(
  board: Board,
  w: Weights,
  player: Player,
  action: ActionType,
  blitzBlockUsed: boolean,
  available: Available
): Activation | null {
  const c = context(
    board,
    w,
    new Map([...available, [player.id, new Set<ActionType>([action])]])
  );
  const carrying = carrierOf(board)?.id === player.id;
  let options: Activation[] = [];
  switch (action) {
    case "move":
    case "standUp":
      options = carrying
        ? carrierActivations(c, player)
        : [
            ...pickupActivation(c, player),
            ...repositionActivation(c, player, roleSquares(c)),
          ];
      break;
    case "block":
      options = blockActivations(c, player);
      break;
    case "blitz":
      options = blitzBlockUsed
        ? carrying
          ? carrierActivations(c, player)
          : [
              ...pickupActivation(c, player),
              ...repositionActivation(c, player, roleSquares(c)),
            ].filter((a) => a.tier !== "risky")
        : [...blitzActivations(c, player), ...pickupActivation(c, player)];
      break;
    case "handoff":
      options = carrying
        ? handoffActivations(c, player)
        : pickupActivation(c, player);
      break;
    case "pass":
      options = carrying
        ? passActivations(c, player)
        : pickupActivation(c, player);
      break;
    default:
      return null;
  }
  return sortActivations(options.filter((a) => a.value > 0))[0] ?? null;
}
