import { type FieldPlayer as Player } from "./board";

import {
  catchTarget,
  interceptTarget,
  passTarget,
} from "../../game/rules/rollPreview";
import {
  PassController,
  type PassRange,
  type PassType,
} from "../../game/controllers/PassController";
import {
  HEIGHT,
  type Square,
  canCarry,
  distance,
  key,
  neighbours,
  onPitch,
  standing,
  toGoal,
} from "./board";
import {
  type Chance,
  type RollTarget,
  d6,
  sequenceChance,
  IMPOSSIBLE,
} from "./chance";
import { type Route } from "./routes";
import {
  type Context,
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

export const CORNERS = [
  [-1, -1],
  [-1, 1],
  [1, -1],
  [1, 1],
] as const;

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

function carrierSquare(c: Context, at: Square, carrier: Player): number {
  const { board, w } = c;
  const progress =
    board.turnsLeft === 0 || c.goal === "protect" ? 0 : w.advance * c.urgency;
  return -toGoal(board, at) * progress + carrierCover(c, at, carrier);
}

function pressure(c: Context, carrier: Player): number {
  return Math.max(0, -carrierCover(c, carrier.gridPosition, carrier));
}

function carrierCover(c: Context, at: Square, carrier: Player): number {
  const { board, w } = c;
  const cage = cageCorners(c, at, carrier);

  const exposed = cage >= 3 ? 0 : 1 - cage / 4;
  const edge = Math.min(at.y, HEIGHT - 1 - at.y);
  return (
    -(w.cageWalk > 0
      ? markRisk(c, carrier, at)
      : board.marks.getUint8(key(at))) *
      w.carrierMarked -
    threats(board, at) * w.carrierThreat * exposed +
    Math.min(cage, 4) * w.cageCorner -
    sidelineCost(edge, w.sideline) -
    exposureCost(c, carrier, at) +
    launchReady(c, carrier, at)
  );
}

function spaceGain(c: Context, carrier: Player, mate: Player): number {
  if (c.board.turnsLeft === 0) return 0;
  const pressed = crowd(c.board, carrier.gridPosition);
  return (
    Math.max(0, pressed - crowd(c.board, mate.gridPosition)) * c.w.sideways
  );
}

const CARRY_TURNS = 3;

export function paceWorth(
  c: Context,
  faster: number,
  turns = CARRY_TURNS
): number {
  if (c.goal === "protect") return 0;
  return c.w.carrierPace * faster * Math.min(c.board.turnsLeft, turns);
}

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
    r.chance *
    (1 - unfedChance({ c: c, player: carrier, action: "move", at: r.to }));
  const bestScore = scoring.sort(
    (a, b) => success(b) - success(a) || a.path.length - b.path.length
  )[0];
  if (!bestScore) return null;
  const late = board.turnsLeft === 0;
  const value =
    scoringValue({
      c: c,
      chance: success(bestScore),
      player: carrier,
      ballLoss: w.ballLoss,
      fallChance: 1 - bestScore.chance,
    }) +
    success(bestScore) * pressure(c, carrier) -
    feedingCost({
      c: c,
      player: carrier,
      action: "move",
      at: bestScore.to,
      carrying: true,
    });

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

interface CarrierMovesArgs {
  c: Context;
  carrier: Player;
  routes: Map<number, Route>;
  plain: Map<number, Route>;
}

function carrierMoves({ c, carrier, routes, plain }: CarrierMovesArgs): {
  safe: CarrierMove;
  risky: CarrierMove;
} {
  const { w } = c;
  const here = carrierSquare(c, carrier.gridPosition, carrier);
  let safe: CarrierMove = null;
  let risky: CarrierMove = null;
  for (const route of carrierMoveRoutes(c, carrier, [
    ...plain.values(),
    ...routes.values(),
  ])) {
    const gain = carrierSquare(c, route.to, carrier) - here;
    const ordinary =
      gamble(c, route.chance, gain) -
      (1 - route.chance) * w.ballLoss -
      moveFeedingCost(c, carrier, route.to);
    const value = lateMoveValue({
      c: c,
      carrier: carrier,
      route: route,
      ordinary: ordinary,
    });
    const isSafe =
      route.chance >= w.safeMove && plain.get(key(route.to)) === route;
    if (!isSafe && improvesMove(risky, value)) risky = { route, value };
    if (isSafe && gain > 0.5 && improvesMove(safe, value))
      safe = { route, value };
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

  const { safe, risky } = stall
    ? { safe: { route: stall, value: w.touchdown * 0.5 }, risky: null }
    : carrierMoves({ c: c, carrier: carrier, routes: routes, plain: plain });
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

function stallRoute(
  c: Context,
  carrier: Player,
  routes: Map<number, Route>
): Route | null {
  const { board } = c;
  if (board.turnsLeft === 0 || board.turnsLeft > 2) return null;
  if (board.lead <= 0) return null;
  const reach = carrier.stats.MA;
  const here = { route: null, at: carrier.gridPosition };
  const options = [
    here,
    ...[...routes.values()].map((route) => ({ route, at: route.to })),
  ].filter(
    ({ route, at }) =>
      (!route || route.chance >= 0.99) &&
      toGoal(board, at) > 0 &&
      toGoal(board, at) <= reach - 1 &&
      board.marks.getUint8(key(at)) === 0 &&
      threats(board, at) === 0
  );
  if (options.length === 0) return null;

  const safety = (at: Square) =>
    Math.min(99, ...board.theirs.map((o) => distance(o.gridPosition, at))) +
    Math.min(2, at.y, HEIGHT - 1 - at.y);
  const pick = options.reduce((best, o) =>
    safety(o.at) > safety(best.at) ? o : best
  );
  return pick.route ?? { to: pick.at, path: [], rolls: [], chance: 1 };
}

function endZoneRoute(c: Context, from: Square, mate: Player): Route | null {
  const { board, w } = c;
  let best: Route | null = null;
  for (const route of c.plainRoutes(mate).values()) {
    const range = PassController.rangeValue(from, route.to);
    if (toGoal(board, route.to) !== 0 || range === null || range > 2) continue;
    if (route.chance < w.safeMove || board.marks.getUint8(key(route.to)) > 0)
      continue;
    if (!best || route.chance > best.chance) best = route;
  }
  return best;
}

function ballMates(c: Context, carrier: Player): Player[] {
  return c.board.ours.filter(
    (mate) => mate.id !== carrier.id && standing(mate) && canCarry(mate)
  );
}

export function deepReceiverActivations(
  c: Context,
  carrier: Player
): Activation[] {
  const { board, w } = c;
  if (!c.available.get(carrier.id)?.has("pass")) return [];
  const from = carrier.gridPosition;
  const out: Activation[] = [];
  for (const mate of ballMates(c, carrier)) {
    if (!c.available.get(mate.id)?.has("move")) continue;
    if (toGoal(board, mate.gridPosition) === 0) continue;
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

function approachTo(
  carrier: Player,
  mate: Player,
  routes: Map<number, Route>
): Route | null | undefined {
  if (distance(carrier.gridPosition, mate.gridPosition) === 1) return null;
  return neighbours(mate.gridPosition)
    .map((s) => routes.get(key(s)))
    .filter((r): r is Route => !!r)
    .sort((a, b) => b.chance - a.chance)[0];
}

interface TransferChanceArgs {
  c: Context;
  carrier: Player;
  mate: Player;
  approach: Route | null;
  transfer: readonly RollTarget[];
  catchRoll: number;
  finish?: Route | null;
}

function transferChance({
  c,
  carrier,
  mate,
  approach,
  transfer,
  catchRoll,
  finish = null,
}: TransferChanceArgs): Chance {
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

interface ScoringTransferChanceArgs {
  c: Context;
  carrier: Player;
  mate: Player;
  approach: Route | null;
  transfer: readonly RollTarget[];
  catchRoll: number;
}

function scoringTransferChance({
  c,
  carrier,
  mate,
  approach,
  transfer,
  catchRoll,
}: ScoringTransferChanceArgs): Chance {
  if (toGoal(c.board, mate.gridPosition) === 0)
    return transferChance({
      c: c,
      carrier: carrier,
      mate: mate,
      approach: approach,
      transfer: transfer,
      catchRoll: catchRoll,
    });
  let best = IMPOSSIBLE;
  for (const finish of c.routes(mate).values()) {
    if (toGoal(c.board, finish.to) !== 0) continue;
    const chance = transferChance({
      c: c,
      carrier: carrier,
      mate: mate,
      approach: approach,
      transfer: transfer,
      catchRoll: catchRoll,
      finish: finish,
    });
    if (chance > best) best = chance;
  }
  return best;
}

interface HandoffToArgs {
  c: Context;
  carrier: Player;
  mate: Player;
  routes: Map<number, Route>;
  carrierReach: number;
  escape: number;
}

function handoffTo({
  c,
  carrier,
  mate,
  routes,
  carrierReach,
  escape,
}: HandoffToArgs): Activation | null {
  const { board, w } = c;
  const scoreChance = scoreChanceOf(c, mate);
  const progress =
    (carrierReach - bestReach(c, mate)) * w.advance * c.urgency +
    spaceGain(c, carrier, mate) +
    handoverPace(c, carrier, mate);
  if (insufficientProgress(c, scoreChance, progress - w.advance * 2))
    return null;
  const target = catchTarget(mate, board.theirs, board.weather, "handoff");

  const approach = approachTo(carrier, mate, routes);
  if (approach === undefined) return null;
  const reach = transferChance({
    c: c,
    carrier: carrier,
    mate: mate,
    approach: approach,
    transfer: [],
    catchRoll: target,
  });
  const scoring = scoreChance > 0;
  const chance = scoring
    ? scoringTransferChance({
        c: c,
        carrier: carrier,
        mate: mate,
        approach: approach,
        transfer: [],
        catchRoll: target,
      })
    : reach;
  const gain = scoring ? w.touchdown : progress;
  return {
    player: carrier,
    action: "handoff",
    intent: { kind: "handoff", to: mate, route: approach },
    tier: tierFor(chance, scoring ? w.safeScore : w.safeMove, "handoff"),
    value:
      transferValue(c, carrier, {
        scoring,
        chance,
        escape,
        progress: gain,
        reach,
      }) - 1,
    rolls: [...(approach?.rolls ?? []), { kind: "catch", target }],
  };
}

export function handoffActivations(c: Context, carrier: Player): Activation[] {
  if (!c.available.get(carrier.id)?.has("handoff")) return [];
  const out: Activation[] = [];
  const routes = c.routes(carrier);
  const carrierReach = bestReach(c, carrier);
  const escape = pressure(c, carrier);
  for (const mate of ballMates(c, carrier)) {
    if (!c.available.has(mate.id)) continue;
    const handoff = handoffTo({
      c: c,
      carrier: carrier,
      mate: mate,
      routes: routes,
      carrierReach: carrierReach,
      escape: escape,
    });
    if (handoff) out.push(handoff);
  }
  return out;
}

const PASS_TYPES = [
  "Quick Pass",
  "Short Pass",
  "Long Pass",
  "Long Bomb",
] as const satisfies readonly PassType[];

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

function offLine(p: Square, a: Square, b: Square): number {
  const [dx, dy] = [b.x - a.x, b.y - a.y];
  const length = dx * dx + dy * dy;
  const t = length
    ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length))
    : 0;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

function notIntercepted(c: Context, from: Square, to: Square): number {
  const { board } = c;

  return board.theirs
    .filter(
      (o) =>
        standing(o) &&
        offLine(o.gridPosition, from, to) <= 1 &&
        distance(o.gridPosition, from) > 0
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

interface BestThrowArgs {
  c: Context;
  carrier: Player;
  throwFrom: (Route | null)[];
  mate: Player;
  catchRoll: number;
}

function bestThrow({
  c,
  carrier,
  throwFrom,
  mate,
  catchRoll,
}: BestThrowArgs): Throw | null {
  const { board } = c;
  const to = mate.gridPosition;
  let best: Throw | null = null;
  for (const route of throwFrom) {
    const from = route?.to ?? carrier.gridPosition;
    const range = passRange(from, to);
    if (!range || from === to) continue;
    const thrower = { ...carrier, gridPosition: from };
    const throwRoll = passTarget(thrower, board.theirs, board.weather, range);
    const intercepted = notIntercepted(c, from, to);
    const transfer: RollTarget[] = [{ kind: "pass", target: throwRoll }];
    const chance =
      transferChance({
        c: c,
        carrier: carrier,
        mate: mate,
        approach: route,
        transfer: transfer,
        catchRoll: catchRoll,
      }) * intercepted;
    const scoreChance =
      scoringTransferChance({
        c: c,
        carrier: carrier,
        mate: mate,
        approach: route,
        transfer: transfer,
        catchRoll: catchRoll,
      }) * intercepted;
    if (betterThrow(best, chance, scoreChance))
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

interface PassToArgs {
  c: Context;
  carrier: Player;
  mate: Player;
  throwFrom: (Route | null)[];
  carrierReach: number;
  escape: number;
}

function passTo({
  c,
  carrier,
  mate,
  throwFrom,
  carrierReach,
  escape,
}: PassToArgs): Activation | null {
  const { board, w } = c;

  const inEndZone = toGoal(board, mate.gridPosition) === 0;
  if (!inEndZone && !c.available.has(mate.id)) return null;
  const scoreChance = inEndZone ? 1 : scoreChanceOf(c, mate);
  const progress =
    (carrierReach - bestReach(c, mate)) * w.advance * c.urgency +
    spaceGain(c, carrier, mate) +
    handoverPace(c, carrier, mate);
  if (insufficientProgress(c, scoreChance, progress - w.advance * 4))
    return null;
  const catchRoll = catchTarget(mate, board.theirs, board.weather, "pass");
  const best = bestThrow({
    c: c,
    carrier: carrier,
    throwFrom: throwFrom,
    mate: mate,
    catchRoll: catchRoll,
  });
  if (!best) return null;
  const scoring = scoreChance > 0;
  const chance = scoring ? best.scoreChance : best.chance;
  return {
    player: carrier,
    action: "pass",
    intent: { kind: "pass", to: mate, route: best.route },
    tier: tierFor(chance, scoring ? w.safeScore : w.safeMove, "handoff"),
    value:
      transferValue(c, carrier, {
        scoring,
        chance,
        escape,
        progress,
        reach: best.chance,
      }) - 2,
    rolls: best.rolls,
  };
}

export function passActivations(c: Context, carrier: Player): Activation[] {
  const { w } = c;
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
  for (const mate of ballMates(c, carrier)) {
    const pass = passTo({
      c: c,
      carrier: carrier,
      mate: mate,
      throwFrom: throwFrom,
      carrierReach: carrierReach,
      escape: escape,
    });
    if (pass) out.push(pass);
  }
  return out;
}

function sidelineCost(edge: number, cost: number): number {
  if (edge === 0) return cost;
  return edge === 1 ? cost / 3 : 0;
}

function carrierMoveRoutes(
  c: Context,
  carrier: Player,
  routes: Route[]
): Route[] {
  const { board } = c;
  const from = carrier.gridPosition;
  const maxBack = board.marks.getUint8(key(from)) > 0 ? 2 : 0;
  return routes.filter(
    (route) =>
      toGoal(board, route.to) !== 0 &&
      toGoal(board, route.to) - toGoal(board, from) <= maxBack
  );
}

function insufficientProgress(
  c: Context,
  scoring: number,
  progress: number
): boolean {
  return scoring === 0 && (c.board.turnsLeft === 0 || progress < 0);
}

function betterThrow(
  best: Throw | null,
  chance: number,
  scoreChance: number
): boolean {
  return (
    !best ||
    scoreChance > best.scoreChance ||
    (scoreChance === best.scoreChance && chance > best.chance)
  );
}

function improvesMove(move: CarrierMove, value: number): boolean {
  return value > (move?.value ?? 0);
}

interface TransferOutcome {
  scoring: boolean;
  chance: number;
  escape: number;
  progress: number;
  reach: number;
}

function transferValue(
  c: Context,
  player: Player,
  outcome: TransferOutcome
): number {
  const { scoring, chance, escape, progress, reach } = outcome;
  if (scoring)
    return (
      scoringValue({ c, chance, player, ballLoss: c.w.ballLoss }) +
      chance * escape
    );
  return gamble(c, chance, progress) - (1 - reach) * c.w.ballLoss;
}
