/**
 * Activations with the ball: the carrier scoring, running, handing off or
 * passing, a receiver getting open, and a loose ball picked up.
 */

import { Player } from "../../types/Player";
import { SkillType, hasSkill } from "../../types/Skills";
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
  HEIGHT,
  Square,
  distance,
  key,
  neighbours,
  onPitch,
  standing,
  toGoal,
} from "./board";
import { Chance, RollTarget, d6, sequenceChance, IMPOSSIBLE } from "./chance";
import { Route } from "./routes";
import {
  Context,
  bestReach,
  crowd,
  gamble,
  scoreChanceOf,
  threats,
  tierFor,
} from "./activationContext";
import { launchReady } from "./teammateActivations";
import type { Activation } from "./activations";
import { feedingCost, moveFeedingCost, unfedChance } from "./feeding";
import {
  exposureCost,
  lateMoveValue,
  markRisk,
  nextTurnReach,
  scoringValue,
} from "./latePlans";

/** The four corners of a square, in the order a cage is counted. */
export const CORNERS = [
  [-1, -1],
  [-1, 1],
  [1, -1],
  [1, 1],
] as const;

/**
 * Corners of `at` a team-mate holds, or one who has not acted can reach
 * safely this turn; each helper counts once.
 */
function cageCorners(c: Context, at: Square, carrier: Player): number {
  const { board, w } = c;
  const helpers = board.ours.filter(
    (p) => p.id !== carrier.id && standing(p) && c.available.has(p.id)
  );
  const used = new Set<string>();
  let cage = 0;
  for (const [dx, dy] of CORNERS) {
    const corner = { x: at.x + dx, y: at.y + dy };
    if (!onPitch(corner)) continue;
    const there = board.occupant[key(corner)];
    if (there) {
      const holds =
        there.teamId === board.us && standing(there) && there.id !== carrier.id;
      if (holds) cage++;
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
  return cage;
}

/**
 * How good a square is for our carrier to end on: closer to the end zone,
 * unmarked, out of reach, and with corners team-mates hold or can still
 * reach safely this turn.
 */
function carrierSquare(c: Context, at: Square, carrier: Player): number {
  const { board, w } = c;
  const progress =
    board.turnsLeft === 0 || c.goal === "protect" ? 0 : w.advance * c.urgency;
  return -toGoal(board, at) * progress + carrierCover(c, at, carrier);
}

/**
 * What a carrier loses by keeping the ball where it stands: the marks,
 * threats and exposure a carrier move is paid for escaping. A play that
 * scores takes the ball out of them too, so it earns the same escape.
 */
function pressure(c: Context, carrier: Player): number {
  return Math.max(0, -carrierCover(c, carrier.gridPosition!, carrier));
}

/** The square's cover for the carrier, apart from its distance to go. */
function carrierCover(c: Context, at: Square, carrier: Player): number {
  const { board, w } = c;
  const cage = cageCorners(c, at, carrier);
  // A cage covers the carrier: corners block four of the eight squares
  // next to it and put tackle zones on the other four.
  const exposed = cage >= 3 ? 0 : 1 - cage / 4;
  const edge = Math.min(at.y, HEIGHT - 1 - at.y);
  return (
    -(w.cageWalk > 0 ? markRisk(c, carrier, at) : board.marks[key(at)]) *
      w.carrierMarked -
    threats(board, at) * w.carrierThreat * exposed +
    Math.min(cage, 4) * w.cageCorner +
    (cage >= 4 ? w.fullCage : 0) -
    (edge === 0 ? w.sideline : edge === 1 ? w.sideline / 3 : 0) -
    exposureCost(c, carrier, at) +
    launchReady(c, carrier, at)
  );
}

/**
 * Moving the ball to a team-mate with fewer defenders near it: a sideways
 * ball that splits the defence. Worth nothing on the last turn.
 */
function spaceGain(c: Context, carrier: Player, mate: Player): number {
  if (c.board.turnsLeft === 0) return 0;
  const pressed = crowd(c.board, carrier.gridPosition!);
  return (
    Math.max(0, pressed - crowd(c.board, mate.gridPosition!)) * c.w.sideways
  );
}

/** The carrier's most likely run into the end zone, worth its risk. */
/** Own turns a new carrier is likely to keep the ball for. */
const CARRY_TURNS = 3;

/**
 * Points for the ball moving `faster` squares a turn quicker, over the
 * turns a carrier keeps it: a spectrum, so the quickest carrier is worth
 * most and a slower one costs. Nothing once the half cannot be won.
 */
function paceWorth(c: Context, faster: number, turns = CARRY_TURNS): number {
  if (c.goal === "protect") return 0;
  return c.w.carrierPace * faster * Math.min(c.board.turnsLeft, turns);
}

/**
 * What the ball gains moving from `from` to `to`: the squares a turn the
 * new carrier reaches beyond the old one, Sprint and rushes included.
 */
function handoverPace(c: Context, from: Player, to: Player): number {
  return paceWorth(c, nextTurnReach(to) - nextTurnReach(from));
}

function scoreActivation(
  c: Context,
  carrier: Player,
  routes: Map<number, Route>
): Activation | null {
  const { board, w } = c;
  const scoring = [...routes.values()].filter((r) => toGoal(board, r.to) === 0);
  const success = (r: Route) =>
    r.chance * (1 - unfedChance(c, carrier, "move", r.to));
  const bestScore = scoring.sort(
    (a, b) => success(b) - success(a) || a.path.length - b.path.length
  )[0];
  if (!bestScore) return null;
  const late = board.turnsLeft === 0;
  const value =
    scoringValue(
      c,
      success(bestScore),
      carrier,
      w.ballLoss,
      1 - bestScore.chance
    ) +
    success(bestScore) * pressure(c, carrier) -
    feedingCost(c, carrier, "move", bestScore.to, true);
  // A carrier already on its way keeps running while the run is worth
  // it: an opening dodge that spent the re-roll must not turn the rest
  // of the run into a reason to step back.
  const underway =
    board.gs.getMovementUsed(carrier.id) > 0 &&
    board.gs.getState().activePlayer?.id === carrier.id;
  return {
    player: carrier,
    action: "move",
    intent: { kind: "score", route: bestScore },
    tier:
      late || (underway && value > 0)
        ? "score"
        : tierFor(bestScore.chance, w.safeScore, "score"),
    value,
    rolls: bestScore.rolls,
  };
}

type CarrierMove = { route: Route; value: number } | null;

/**
 * The carrier's best move to a better square: a safe one, and a risky one
 * paid for with the ball when only a gamble gains.
 */
function carrierMoves(
  c: Context,
  carrier: Player,
  routes: Map<number, Route>,
  plain: Map<number, Route>
): { safe: CarrierMove; risky: CarrierMove } {
  const { board, w } = c;
  const here = carrierSquare(c, carrier.gridPosition!, carrier);
  const from = carrier.gridPosition!;
  // Never run the ball back, unless it is escaping a tackle zone.
  const maxBack = board.marks[key(from)] > 0 ? 2 : 0;
  let safe: CarrierMove = null;
  let risky: CarrierMove = null;
  for (const route of [...plain.values(), ...routes.values()]) {
    if (toGoal(board, route.to) === 0) continue;
    const back = toGoal(board, route.to) - toGoal(board, from);
    if (back > maxBack) continue;
    const gain = carrierSquare(c, route.to, carrier) - here;
    const ordinary =
      gamble(c, route.chance, gain) -
      (1 - route.chance) * w.ballLoss -
      moveFeedingCost(c, carrier, route.to);
    const value = lateMoveValue(c, carrier, route, ordinary);
    const isSafe =
      route.chance >= w.safeMove && plain.get(key(route.to)) === route;
    if (!isSafe) {
      if (value > (risky?.value ?? 0)) risky = { route, value };
    } else if (gain > 0.5 && value > (safe?.value ?? 0)) {
      safe = { route, value };
    }
  }
  return { safe, risky };
}

export function carrierActivations(c: Context, carrier: Player): Activation[] {
  const { w } = c;
  const out: Activation[] = [];
  const routes = c.routes(carrier);
  const plain = c.plainRoutes(carrier);
  const stall = stallRoute(c, carrier, plain);
  const score = stall ? null : scoreActivation(c, carrier, routes);
  if (score) out.push(score);
  // Move the carrier to a better square: safely if it can, or, when only
  // a risky route gains, as a risky action paid for with the ball.
  const { safe, risky } = stall
    ? { safe: { route: stall, value: w.touchdown * 0.5 }, risky: null }
    : carrierMoves(c, carrier, routes, plain);
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
  if (board.lead <= 0) return null;
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

/** A team-mate's safest route to an open end zone square in passing range. */
function endZoneRoute(c: Context, from: Square, mate: Player): Route | null {
  const { board, w } = c;
  let best: Route | null = null;
  for (const route of c.plainRoutes(mate).values()) {
    const range = PassController.rangeValue(from, route.to);
    if (toGoal(board, route.to) !== 0 || range === null || range > 2) continue;
    if (route.chance < w.safeMove || board.marks[key(route.to)] > 0) continue;
    if (!best || route.chance > best.chance) best = route;
  }
  return best;
}

/**
 * Before the carrier acts, a team-mate who can safely reach an open end
 * zone square within passing range goes there to catch a scoring pass.
 */
export function deepReceiverActivations(
  c: Context,
  carrier: Player
): Activation[] {
  const { board, w } = c;
  if (!c.available.get(carrier.id)?.has("pass")) return [];
  const from = carrier.gridPosition!;
  const out: Activation[] = [];
  for (const mate of board.ours) {
    if (mate.id === carrier.id || !standing(mate)) continue;
    if (!c.available.get(mate.id)?.has("move")) continue;
    if (toGoal(board, mate.gridPosition!) === 0) continue;
    const best = endZoneRoute(c, from, mate);
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

/**
 * The carrier's likeliest route to beside the receiver: null when it is
 * already there, undefined when it cannot get there.
 */
function approachTo(
  carrier: Player,
  mate: Player,
  routes: Map<number, Route>
): Route | null | undefined {
  if (distance(carrier.gridPosition!, mate.gridPosition!) === 1) return null;
  return neighbours(mate.gridPosition!)
    .map((s) => routes.get(key(s)))
    .filter((r): r is Route => !!r)
    .sort((a, b) => b.chance - a.chance)[0];
}

/** Approach, transfer and receiver movement spend from one shared reroll bank. */
function transferChance(
  c: Context,
  carrier: Player,
  mate: Player,
  approach: Route | null,
  transfer: readonly RollTarget[],
  catchRoll: number,
  finish: Route | null = null
): Chance {
  return sequenceChance(
    [
      { player: carrier, rolls: [...(approach?.rolls ?? []), ...transfer] },
      {
        player: mate,
        rolls: [{ kind: "catch", target: catchRoll }, ...(finish?.rolls ?? [])],
      },
    ],
    c.teamReroll,
    (player, skill) =>
      c.board.gs.getRerollArbiter().skillRerollAvailable(player, skill)
  );
}

/** Price every finish together with the transfer's shared reroll budget. */
function scoringTransferChance(
  c: Context,
  carrier: Player,
  mate: Player,
  approach: Route | null,
  transfer: readonly RollTarget[],
  catchRoll: number
): Chance {
  if (toGoal(c.board, mate.gridPosition!) === 0)
    return transferChance(c, carrier, mate, approach, transfer, catchRoll);
  let best = IMPOSSIBLE;
  for (const finish of c.routes(mate).values()) {
    if (toGoal(c.board, finish.to) !== 0) continue;
    const chance = transferChance(
      c,
      carrier,
      mate,
      approach,
      transfer,
      catchRoll,
      finish
    );
    if (chance > best) best = chance;
  }
  return best;
}

/** Hand the ball to `mate`, if it is worth it. */
function handoffTo(
  c: Context,
  carrier: Player,
  mate: Player,
  routes: Map<number, Route>,
  carrierReach: number,
  escape: number
): Activation | null {
  const { board, w } = c;
  const scoreChance = scoreChanceOf(c, mate);
  const progress =
    (carrierReach - bestReach(c, mate)) * w.advance * c.urgency +
    spaceGain(c, carrier, mate) +
    handoverPace(c, carrier, mate);
  if (scoreChance === 0 && (board.turnsLeft === 0 || progress < w.advance * 2))
    return null;
  const target = catchTarget(mate, board.theirs, board.weather, "handoff");
  // Get next to the receiver first, unless already there.
  const approach = approachTo(carrier, mate, routes);
  if (approach === undefined) return null;
  const reach = transferChance(c, carrier, mate, approach, [], target);
  const scoring = scoreChance > 0;
  const chance = scoring
    ? scoringTransferChance(c, carrier, mate, approach, [], target)
    : reach;
  const gain = scoring ? w.touchdown : progress;
  return {
    player: carrier,
    action: "handoff",
    intent: { kind: "handoff", to: mate, route: approach },
    tier: tierFor(chance, scoring ? w.safeScore : w.safeMove, "handoff"),
    value:
      (scoring
        ? scoringValue(c, chance, carrier, w.ballLoss) + chance * escape
        : gamble(c, chance, gain) - (1 - reach) * w.ballLoss) - 1,
    rolls: [...(approach?.rolls ?? []), { kind: "catch", target }],
  };
}

/**
 * Hand the ball to a team-mate who has not acted yet: one who can then
 * score, or one who can carry it further than the carrier can.
 */
export function handoffActivations(c: Context, carrier: Player): Activation[] {
  const { board } = c;
  if (!c.available.get(carrier.id)?.has("handoff")) return [];
  const out: Activation[] = [];
  const routes = c.routes(carrier);
  const carrierReach = bestReach(c, carrier);
  const escape = pressure(c, carrier);
  for (const mate of board.ours) {
    if (mate.id === carrier.id || !standing(mate) || !c.available.has(mate.id))
      continue;
    const handoff = handoffTo(c, carrier, mate, routes, carrierReach, escape);
    if (handoff) out.push(handoff);
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
export function passRange(from: Square, to: Square): PassRange | null {
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

/** The chance no standing opponent near the line intercepts it. */
function notIntercepted(c: Context, from: Square, to: Square): number {
  const { board } = c;
  // Each standing opponent near the line may try to intercept.
  return board.theirs
    .filter(
      (o) =>
        standing(o) &&
        offLine(o.gridPosition!, from, to) <= 1 &&
        distance(o.gridPosition!, from) > 0
    )
    .reduce(
      (p, o) => p * (1 - d6(interceptTarget(o, -3, board.ours, board.weather))),
      1
    );
}

interface Throw {
  route: Route | null;
  chance: number;
  rolls: RollTarget[];
  scoreChance: number;
}

/** The square, of those the thrower can reach, the pass most likely completes from. */
function bestThrow(
  c: Context,
  carrier: Player,
  throwFrom: (Route | null)[],
  mate: Player,
  catchRoll: number
): Throw | null {
  const { board } = c;
  const to = mate.gridPosition!;
  let best: Throw | null = null;
  for (const route of throwFrom) {
    const from = route?.to ?? carrier.gridPosition!;
    const range = passRange(from, to);
    if (!range || from === to) continue;
    const thrower = { ...carrier, gridPosition: from };
    const throwRoll = passTarget(thrower, board.theirs, board.weather, range);
    const intercepted = notIntercepted(c, from, to);
    const transfer: RollTarget[] = [{ kind: "pass", target: throwRoll }];
    const chance =
      transferChance(c, carrier, mate, route, transfer, catchRoll) *
      intercepted;
    const scoreChance =
      scoringTransferChance(c, carrier, mate, route, transfer, catchRoll) *
      intercepted;
    if (
      !best ||
      scoreChance > best.scoreChance ||
      (scoreChance === best.scoreChance && chance > best.chance)
    )
      best = {
        route,
        chance,
        rolls: [
          ...(route?.rolls ?? []),
          ...transfer,
          { kind: "catch", target: catchRoll },
        ],
        scoreChance,
      };
  }
  return best;
}

/** Throw to `mate`, from the best square, if it is worth it. */
function passTo(
  c: Context,
  carrier: Player,
  mate: Player,
  throwFrom: (Route | null)[],
  carrierReach: number,
  escape: number
): Activation | null {
  const { board, w } = c;
  // A catch in the end zone scores; elsewhere the receiver must still
  // have its own activation to run the ball in or on.
  const inEndZone = toGoal(board, mate.gridPosition!) === 0;
  if (!inEndZone && !c.available.has(mate.id)) return null;
  const scoreChance = inEndZone ? 1 : scoreChanceOf(c, mate);
  const progress =
    (carrierReach - bestReach(c, mate)) * w.advance * c.urgency +
    spaceGain(c, carrier, mate) +
    handoverPace(c, carrier, mate);
  if (scoreChance === 0 && (board.turnsLeft === 0 || progress < w.advance * 4))
    return null;
  const catchRoll = catchTarget(mate, board.theirs, board.weather, "pass");
  const best = bestThrow(c, carrier, throwFrom, mate, catchRoll);
  if (!best) return null;
  const scoring = scoreChance > 0;
  const chance = scoring ? best.scoreChance : best.chance;
  return {
    player: carrier,
    action: "pass",
    intent: { kind: "pass", to: mate, route: best.route },
    tier: tierFor(
      chance as Chance,
      scoring ? w.safeScore : w.safeMove,
      "handoff"
    ),
    value:
      (scoring
        ? scoringValue(c, chance, carrier, w.ballLoss) + chance * escape
        : gamble(c, chance, progress) - (1 - best.chance) * w.ballLoss) - 2,
    rolls: best.rolls,
  };
}

/**
 * Throw to a team-mate who has not acted yet: one who can then score, or
 * one well downfield. The thrower may first walk to a better square to
 * throw from, dodging out of a marked cage if it must: the walk's rolls are
 * priced into the pass. Walks likelier to fail than a safe score are left.
 */
export function passActivations(c: Context, carrier: Player): Activation[] {
  const { board, w } = c;
  if (!c.available.get(carrier.id)?.has("pass")) return [];
  const throwFrom: (Route | null)[] = [
    null,
    ...[...c.plainRoutes(carrier).values()].filter(
      (r) => r.chance >= w.safeScore
    ),
  ];
  const carrierReach = bestReach(c, carrier);
  const escape = pressure(c, carrier);
  const out: Activation[] = [];
  for (const mate of board.ours) {
    if (mate.id === carrier.id || !standing(mate)) continue;
    const pass = passTo(c, carrier, mate, throwFrom, carrierReach, escape);
    if (pass) out.push(pass);
  }
  return out;
}

/**
 * A picker short of the team's quickest carrier: one who can hand the
 * ball on loses a turn of pace; one with My Ball keeps it to the end.
 */
export function pickupPace(c: Context, player: Player): number {
  // The picker counts too: a prone picker with nobody else standing is
  // its own quickest carrier, never short of an empty team. A No Ball
  // player cannot carry, so it sets no benchmark.
  const quickest = Math.max(
    nextTurnReach(player),
    ...c.board.ours
      .filter((p) => standing(p) && !hasSkill(p.skills, SkillType.NO_BALL))
      .map((p) => nextTurnReach(p))
  );
  return paceWorth(
    c,
    nextTurnReach(player) - quickest,
    hasSkill(player.skills, SkillType.MY_BALL) ? CARRY_TURNS : 1
  );
}

export function pickupActivation(c: Context, player: Player): Activation[] {
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
      value: gamble(c, route.chance, w.pickup + pickupPace(c, player)),
      rolls: route.rolls,
    },
  ];
}
