import { type FieldPlayer as Player } from "./board";

import { SkillType, hasSkill } from "../../types/Skills";
import { PassController } from "../../game/controllers/PassController";
import { weatherEffects } from "../../game/rules/weather";
import {
  isRightStuffEligible,
  throwTeammateAims,
} from "../../game/rules/throwTeammate";
import {
  type Board,
  pitchHeight,
  type Square,
  pitchWidth,
  carrierOf,
  distance,
  key,
  onPitch,
  standing,
  toGoal,
} from "./board";
import { type RollTarget, d6 } from "./chance";
import { routesFor, withTeamReroll } from "./routes";
import { type Context, threats, tierFor } from "./activationContext";
import type { Activation } from "./activations";
import {
  finalBallLoss,
  injuryRiskValue,
  nextTurnReach,
  scoringValue,
} from "./latePlans";

export const THROW_REACH = 6;

const canThrowTeammates = (p: Player) =>
  hasSkill(p.skills, SkillType.THROW_TEAM_MATE) ||
  hasSkill(p.skills, SkillType.KICK_TEAM_MATE);

export function throwersFor(board: Board, carrier: Player): Player[] {
  return board.ours.filter(
    (p) => p.id !== carrier.id && standing(p) && canThrowTeammates(p)
  );
}

const launchTurn = (board: Board) => board.turnsLeft <= 1;

export function launchReady(c: Context, carrier: Player, at: Square): number {
  const { board, w } = c;
  if (!isRightStuffEligible(carrier) || !launchTurn(board)) return 0;
  const goal = toGoal(board, at);
  const ready = throwersFor(board, carrier).some(
    (t) =>
      distance(t.gridPosition, at) === 1 &&
      (board.turnsLeft === 0
        ? c.available.has(t.id) && goal <= THROW_REACH
        : goal <= THROW_REACH + nextTurnReach(carrier))
  );
  return ready ? w.launch : 0;
}

const DIRECTIONS = [
  [-1, -1],
  [0, -1],
  [1, -1],
  [-1, 0],
  [1, 0],
  [-1, 1],
  [0, 1],
  [1, 1],
] as const;

const clamp = (s: Square): Square => ({
  x: Math.max(0, Math.min(pitchWidth() - 1, s.x)),
  y: Math.max(0, Math.min(pitchHeight() - 1, s.y)),
});

const scatterCache = new Map<number, ReadonlyMap<number, number>>();
function scatterFrom(aim: Square): ReadonlyMap<number, number> {
  const known = scatterCache.get(key(aim));
  if (known) return known;
  const out = new Map<number, number>();
  const visit = (at: Square, rolls: number, p: number) => {
    if (rolls === 3 || !onPitch(at)) {
      const k = key(clamp(at));
      out.set(k, (out.get(k) ?? 0) + p);
      return;
    }
    for (const [dx, dy] of DIRECTIONS)
      visit({ x: at.x + dx, y: at.y + dy }, rolls + 1, p / 8);
  };
  visit(aim, 0, 1);
  scatterCache.set(key(aim), out);
  return out;
}

interface ThrowOdds {
  superb: number;
  subpar: number;

  fumble: number;

  eaten: number;

  needed: number;

  kick: boolean;
}

function throwOdds(board: Board, thrower: Player, aim: Square): ThrowOdds {
  const from = thrower.gridPosition;
  const kick =
    hasSkill(thrower.skills, SkillType.KICK_TEAM_MATE) &&
    !hasSkill(thrower.skills, SkillType.THROW_TEAM_MATE);
  const modifier =
    -(PassController.rangeValue(from, aim) ?? 3) -
    board.marks.getUint8(key(from)) +
    weatherEffects(board.weather).passingAbility +
    (!kick && hasSkill(thrower.skills, SkillType.STRONG_ARM) ? 1 : 0);
  const PA = thrower.stats.PA;
  const [superb, fumble] = accuracyCounts(PA, modifier);
  const hungry = hasSkill(thrower.skills, SkillType.ALWAYS_HUNGRY) ? 1 / 6 : 0;
  const thrown = 1 - hungry;
  return {
    superb: (thrown * superb) / 6,
    subpar: (thrown * (6 - superb - fumble)) / 6,
    fumble: (thrown * fumble) / 6 + (hungry * 5) / 6,
    eaten: hungry / 6,
    needed: Math.max(2, Math.min(6, PA - modifier)),
    kick,
  };
}

interface LandedBoardArgs {
  board: Board;
  mate: Player;
  at: Square;
  carrying: boolean;
}

function landedBoard({ board, mate, at, carrying }: LandedBoardArgs): {
  after: Board;
  landed: Player;
} {
  const landed: Player = { ...mate, gridPosition: at };
  const occupant = [...board.occupant];
  occupant[key(mate.gridPosition)] = undefined;
  occupant[key(at)] = landed;
  const swap = (p: Player) => (p.id === mate.id ? landed : p);
  let ball = board.ball;
  if (carrying) ball = { kind: "carried", at, carrier: landed };
  else if (board.ball.kind === "carried" && board.ball.carrier.id === mate.id)
    ball = { kind: "loose", at };
  return {
    landed,
    after: {
      ...board,
      occupant,
      ours: board.ours.map(swap),
      everyone: board.everyone.map(swap),
      ball,
    },
  };
}

function carrierStanding(c: Context, at: Square): number {
  const { board, w } = c;
  const progress =
    board.turnsLeft === 0 || c.goal === "protect" ? 0 : w.advance * c.urgency;
  return (
    -toGoal(board, at) * progress -
    board.marks.getUint8(key(at)) * w.carrierMarked -
    threats(board, at) * w.carrierThreat
  );
}

function carrierLanding(c: Context, mate: Player, at: Square): number {
  const { board, w } = c;
  if (toGoal(board, at) === 0) return w.touchdown;

  const stand = carrierStanding(c, at) - carrierStanding(c, mate.gridPosition);
  if (!c.available.has(mate.id)) return stand;
  const { after, landed } = landedBoard({
    board: board,
    mate: mate,
    at: at,
    carrying: true,
  });
  const plain = routesFor({ board: after, player: landed });
  const routes = c.teamReroll
    ? withTeamReroll(plain, landed, (skill) =>
        board.gs.getRerollArbiter().skillRerollAvailable(landed, skill)
      )
    : plain;
  let run = -Infinity;
  for (const route of routes.values())
    if (toGoal(board, route.to) === 0)
      run = Math.max(
        run,
        scoringValue({
          c: { ...c, board: after },
          chance: route.chance,
          player: landed,
          ballLoss: w.ballLoss,
        })
      );
  return Math.max(stand, run);
}

interface LooseBallLandingArgs {
  c: Context;
  mate: Player;
  at: Square;
  ball: Square;
}

function looseBallLanding({ c, mate, at, ball }: LooseBallLandingArgs) {
  if (!c.available.has(mate.id)) return 0;
  const { after, landed } = landedBoard({
    board: c.board,
    mate: mate,
    at: at,
    carrying: false,
  });
  const there =
    routesFor({ board: after, player: landed }).get(key(ball))?.chance ?? 0;
  const here = c.plainRoutes(mate).get(key(ball))?.chance ?? 0;
  return Math.max(0, there - here) * c.w.pickup;
}

interface ReceiverLandingArgs {
  c: Context;
  mate: Player;
  at: Square;
  carrier: Player;
}

function receiverLanding({
  c,
  mate,
  at,
  carrier,
}: ReceiverLandingArgs): number {
  const { board, w } = c;
  if (!c.available.get(carrier.id)?.has("pass")) return 0;
  if (toGoal(board, at) !== 0 || toGoal(board, mate.gridPosition) === 0)
    return 0;
  const range = PassController.rangeValue(carrier.gridPosition, at);
  return board.marks.getUint8(key(at)) === 0 && range !== null && range <= 2
    ? w.touchdown * 0.4
    : 0;
}

function supportLanding(c: Context, mate: Player, at: Square): number {
  const { board, w } = c;
  if (board.ball.kind === "loose")
    return looseBallLanding({ c: c, mate: mate, at: at, ball: board.ball.at });
  const carrier = carrierOf(board);
  if (!carrier) return 0;
  if (carrier.teamId === board.us)
    return receiverLanding({ c: c, mate: mate, at: at, carrier: carrier });
  const marks = (s: Square) => distance(carrier.gridPosition, s) === 1;
  return marks(at) && !marks(mate.gridPosition) ? w.markCarrier : 0;
}

interface Descent {
  at: Square | null;
  p: number;
  superb: boolean;
}

interface ComingDownArgs {
  aim: Square;
  from: Square;
  odds: ThrowOdds;
  bullseye: boolean;
}

function comingDown({ aim, from, odds, bullseye }: ComingDownArgs): Descent[] {
  const out = fumbledLandings(from, odds);
  const cellAt = (cell: number) => ({
    x: cell % pitchWidth(),
    y: Math.floor(cell / pitchWidth()),
  });
  for (const [superb, p] of [
    [true, odds.superb],
    [false, odds.subpar],
  ] as const) {
    if (superb && bullseye) {
      out.push({ at: clamp(aim), p, superb });
      continue;
    }
    for (const [cell, q] of scatterFrom(aim))
      out.push({ at: cellAt(cell), p: p * q, superb });
  }
  return out.filter((d) => d.p > 0);
}

interface ThrowAtArgs {
  c: Context;
  thrower: Player;
  mate: Player;
  aim: Square;
  landing: (at: Square) => number;
}

function throwAt({ c, thrower, mate, aim, landing }: ThrowAtArgs): Activation {
  const { board, w } = c;
  const carrying = carrierOf(board)?.id === mate.id;
  const odds = throwOdds(board, thrower, aim);
  const hurt = injuryRiskValue(c, mate);

  const last = board.turnsLeft === 0;
  const turnover = last ? 0 : c.turnover;
  const dropped = (at: Square) =>
    carrying
      ? turnover + (last ? finalBallLoss(c, at, w.ballLoss) : w.ballLoss)
      : 0;

  const comesDown = (at: Square, superb: boolean): [number, number] => {
    const occupant = board.occupant[key(at)];
    if (occupant && occupant.id !== mate.id) {
      const theirs = occupant.teamId !== board.us;
      const hit = theirs
        ? w.knockdown +
          (carrierOf(board)?.id === occupant.id ? w.carrierKnockdown : 0)
        : -w.ownDown - (carrying ? 0 : turnover);
      return [0, hit - hurt - dropped(at)];
    }
    const needed =
      mate.stats.AG + (superb ? 0 : 1) + board.marks.getUint8(key(at));
    const lands = d6(needed);
    return [lands, lands * landing(at) - (1 - lands) * (hurt + dropped(at))];
  };
  const from = thrower.gridPosition;
  let value = -odds.eaten * (hurt * 5 + dropped(from));
  let good = 0;
  for (const { at, p, superb } of comingDown({
    aim: aim,
    from: from,
    odds: odds,
    bullseye: hasSkill(thrower.skills, SkillType.BULLSEYE),
  })) {
    const [lands, worth] = at
      ? comesDown(at, superb)
      : [0, -(hurt * 2 + (carrying ? dropped(from) : turnover))];
    value += p * worth;
    if (worth > 0) good += p * lands;
  }
  const rolls: RollTarget[] = [
    { kind: "throw", target: odds.needed },
    { kind: "landing", target: mate.stats.AG + board.marks.getUint8(key(aim)) },
  ];
  return {
    player: thrower,
    action: "throwTeamMate",
    intent: { kind: "throw-teammate", mate, aim, carrying },
    tier: tierFor(good, carrying ? w.safeScore : w.safeMove, "handoff"),
    value,
    rolls,
  };
}

const throwable = (thrower: Player, mate: Player) =>
  mate.id !== thrower.id &&
  standing(mate) &&
  distance(mate.gridPosition, thrower.gridPosition) === 1 &&
  isRightStuffEligible(mate);

function bestThrow(
  c: Context,
  thrower: Player,
  mate: Player
): Activation | null {
  const { board } = c;
  const carrying = carrierOf(board)?.id === mate.id;
  const worth = new Map<number, number>();
  const landing = (at: Square) => {
    let value = worth.get(key(at));
    if (value === undefined) {
      value = carrying
        ? carrierLanding(c, mate, at)
        : supportLanding(c, mate, at);
      worth.set(key(at), value);
    }
    return value;
  };

  const ahead = (aim: Square) =>
    !carrying || toGoal(board, aim) < toGoal(board, mate.gridPosition);
  let best: Activation | null = null;
  for (const aim of throwTeammateAims(thrower.gridPosition).filter(ahead)) {
    const plan = throwAt({
      c: c,
      thrower: thrower,
      mate: mate,
      aim: aim,
      landing: landing,
    });
    if (!best || plan.value > best.value) best = plan;
  }
  return best;
}

export function throwTeammateActivations(
  c: Context,
  thrower: Player
): Activation[] {
  if (!standing(thrower)) return [];
  return c.board.ours
    .filter((mate) => throwable(thrower, mate))
    .map((mate) => bestThrow(c, thrower, mate))
    .filter((plan): plan is Activation => plan !== null);
}

function accuracyCounts(PA: number, modifier: number): [number, number] {
  let superb = 0;
  let fumble = 0;
  for (let roll = 1; roll <= 6; roll++) {
    if (roll === 1 || (roll !== 6 && roll + modifier <= 1)) fumble++;
    else if (roll === 6 || Math.min(6, roll + modifier) >= PA) superb++;
  }
  return [superb, fumble];
}

function fumbledLandings(from: Square, odds: ThrowOdds): Descent[] {
  if (odds.kick) return [{ at: null, p: odds.fumble, superb: false }];
  return DIRECTIONS.map(([dx, dy]) => {
    const at = { x: from.x + dx, y: from.y + dy };
    return { at: onPitch(at) ? at : null, p: odds.fumble / 8, superb: false };
  });
}
