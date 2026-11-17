/**
 * Throw Team-mate: launch a Right Stuff team-mate, with or without the ball.
 * Every Quick or Short aim square is priced over the engine's own dice: the
 * Passing Ability Test, three Scatter rolls (none on a Bullseye Superb
 * Throw), and the Landing roll. A thrown player who has not acted may run on
 * after landing, so a carrier thrown into reach can still score this turn.
 */

import { Player } from "../../types/Player";
import { SkillType, hasSkill } from "../../types/Skills";
import { PassController } from "../../game/controllers/PassController";
import { weatherEffects } from "../../game/rules/weather";
import {
  isRightStuffEligible,
  throwTeammateAims,
} from "../../game/rules/throwTeammate";
import {
  Board,
  HEIGHT,
  Square,
  WIDTH,
  carrierOf,
  distance,
  key,
  onPitch,
  standing,
  toGoal,
} from "./board";
import { Chance, RollTarget, d6 } from "./chance";
import { routesFor, withTeamReroll } from "./routes";
import { Context, threats, tierFor } from "./activationContext";
import type { Activation } from "./activations";
import { finalBallLoss, injuryRiskValue, scoringValue } from "./latePlans";

/** The eight Scatter directions, each one face of the D8. */
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
  x: Math.max(0, Math.min(WIDTH - 1, s.x)),
  y: Math.max(0, Math.min(HEIGHT - 1, s.y)),
});

/**
 * Where three Scatter rolls from `aim` put the thrown player, by square key.
 * Like the engine, the scatter stops at the first square off the pitch and
 * the player comes down on the nearest square on it.
 */
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
  /** Passed the test, or a natural 6: no landing penalty. */
  superb: number;
  subpar: number;
  /** Fumbled, or squirmed free of an Always Hungry thrower. */
  fumble: number;
  /** An Always Hungry thrower ate the team-mate. */
  eaten: number;
  /** The face the test needs, for the coach's note. */
  needed: number;
}

/** The engine's Throw Team-mate test, die face by die face. */
function throwOdds(board: Board, thrower: Player, aim: Square): ThrowOdds {
  const from = thrower.gridPosition!;
  const kick =
    hasSkill(thrower.skills, SkillType.KICK_TEAM_MATE) &&
    !hasSkill(thrower.skills, SkillType.THROW_TEAM_MATE);
  const modifier =
    -(PassController.rangeValue(from, aim) ?? 3) -
    board.marks[key(from)] +
    weatherEffects(board.weather).passingAbility +
    (!kick && hasSkill(thrower.skills, SkillType.STRONG_ARM) ? 1 : 0);
  const PA = thrower.stats.PA;
  let superb = 0;
  let fumble = 0;
  for (let roll = 1; roll <= 6; roll++) {
    if (roll === 1 || (roll !== 6 && roll + modifier <= 1)) fumble++;
    else if (roll === 6 || Math.min(6, roll + modifier) >= PA) superb++;
  }
  const hungry = hasSkill(thrower.skills, SkillType.ALWAYS_HUNGRY) ? 1 / 6 : 0;
  const thrown = 1 - hungry;
  return {
    superb: (thrown * superb) / 6,
    subpar: (thrown * (6 - superb - fumble)) / 6,
    fumble: (thrown * fumble) / 6 + (hungry * 5) / 6,
    eaten: hungry / 6,
    needed: Math.max(2, Math.min(6, PA - modifier)),
  };
}

/** The board as it stands once `mate` lands on its feet at `at`. */
function landedBoard(
  board: Board,
  mate: Player,
  at: Square,
  carrying: boolean
): { after: Board; landed: Player } {
  const landed: Player = { ...mate, gridPosition: at };
  const occupant = [...board.occupant];
  occupant[key(mate.gridPosition!)] = undefined;
  occupant[key(at)] = landed;
  const swap = (p: Player) => (p.id === mate.id ? landed : p);
  return {
    landed,
    after: {
      ...board,
      occupant,
      ours: board.ours.map(swap),
      everyone: board.everyone.map(swap),
      ball: carrying
        ? { kind: "carried", at, carrier: landed }
        : board.ball.kind === "carried" && board.ball.carrier.id === mate.id
          ? { kind: "loose", at }
          : board.ball,
    },
  };
}

/** How good a square is for our carrier to stand on, before it moves again. */
function carrierStanding(c: Context, at: Square): number {
  const { board, w } = c;
  const progress =
    board.turnsLeft === 0 || c.goal === "protect" ? 0 : w.advance * c.urgency;
  return (
    -toGoal(board, at) * progress -
    board.marks[key(at)] * w.carrierMarked -
    threats(board, at) * w.carrierThreat
  );
}

/**
 * What landing on its feet at `at` is worth to a thrown carrier: a touchdown
 * in the end zone, else the better of running in now, if it may still act,
 * and standing there.
 */
function carrierLanding(c: Context, mate: Player, at: Square): number {
  const { board, w } = c;
  if (toGoal(board, at) === 0) return w.touchdown;
  const stand = carrierStanding(c, at);
  if (!c.available.has(mate.id)) return stand;
  const { after, landed } = landedBoard(board, mate, at, true);
  const plain = routesFor(after, landed);
  const routes = c.teamReroll
    ? withTeamReroll(plain, landed, (skill) =>
        board.gs.getRerollArbiter().skillRerollAvailable(landed, skill)
      )
    : plain;
  let run = -Infinity;
  for (const route of routes.values())
    if (toGoal(board, route.to) === 0)
      run = Math.max(run, scoringValue(c, route.chance, landed, w.ballLoss));
  return Math.max(stand, run);
}

/** Getting to a loose ball the thrown player could not reach as well before. */
function looseBallLanding(c: Context, mate: Player, at: Square, ball: Square) {
  if (!c.available.has(mate.id)) return 0;
  const { after, landed } = landedBoard(c.board, mate, at, false);
  const there = routesFor(after, landed).get(key(ball))?.chance ?? 0;
  const here = c.plainRoutes(mate).get(key(ball))?.chance ?? 0;
  return Math.max(0, there - here) * c.w.pickup;
}

/** Open in the end zone, in range of our carrier's pass still to come. */
function receiverLanding(
  c: Context,
  mate: Player,
  at: Square,
  carrier: Player
): number {
  const { board, w } = c;
  if (!c.available.get(carrier.id)?.has("pass")) return 0;
  if (toGoal(board, at) !== 0 || toGoal(board, mate.gridPosition!) === 0)
    return 0;
  const range = PassController.rangeValue(carrier.gridPosition!, at);
  return board.marks[key(at)] === 0 && range !== null && range <= 2
    ? w.touchdown * 0.4
    : 0;
}

/**
 * What landing on its feet at `at` is worth to a thrown player without the
 * ball: reaching a loose ball, getting open in an end zone for a pass still
 * to come, or marking the opposing carrier.
 */
function supportLanding(c: Context, mate: Player, at: Square): number {
  const { board, w } = c;
  if (board.ball.kind === "loose")
    return looseBallLanding(c, mate, at, board.ball.at);
  const carrier = carrierOf(board);
  if (!carrier) return 0;
  if (carrier.teamId === board.us) return receiverLanding(c, mate, at, carrier);
  const marks = (s: Square) => distance(carrier.gridPosition!, s) === 1;
  return marks(at) && !marks(mate.gridPosition!) ? w.markCarrier : 0;
}

/** One thrown player at one aim square, priced over every way it can land. */
function throwAt(
  c: Context,
  thrower: Player,
  mate: Player,
  aim: Square,
  landing: (at: Square) => number
): Activation {
  const { board, w } = c;
  const carrying = carrierOf(board)?.id === mate.id;
  const odds = throwOdds(board, thrower, aim);
  const bullseye = hasSkill(thrower.skills, SkillType.BULLSEYE);
  const hurt = injuryRiskValue(c, mate);
  // A Turnover on the last turn only costs a reply that changes the result.
  const last = board.turnsLeft === 0;
  const turnover = last ? 0 : c.turnover;
  const dropped = (at: Square) =>
    carrying
      ? turnover + (last ? finalBallLoss(c, at, w.ballLoss) : w.ballLoss)
      : 0;
  /** A thrown player who comes down at `at` after a superb or subpar throw. */
  const comesDown = (at: Square, superb: boolean): [number, number] => {
    const occupant = board.occupant[key(at)];
    if (occupant && occupant.id !== mate.id) {
      // A crash knocks both players down; the opposing carrier drops the ball.
      const theirs = occupant.teamId !== board.us;
      const hit = theirs
        ? w.knockdown +
          (carrierOf(board)?.id === occupant.id ? w.carrierKnockdown : 0)
        : -w.ownDown;
      return [0, hit - hurt - dropped(at)];
    }
    const needed = mate.stats.AG + (superb ? 0 : 1) + board.marks[key(at)];
    const lands = d6(needed);
    return [lands, lands * landing(at) - (1 - lands) * (hurt + dropped(at))];
  };
  const from = thrower.gridPosition!;
  let value =
    -odds.fumble * (turnover + hurt + dropped(from)) -
    odds.eaten * (hurt * 5 + dropped(from));
  let good = 0;
  for (const [superb, p] of [
    [true, odds.superb],
    [false, odds.subpar],
  ] as const) {
    if (p === 0) continue;
    const spread =
      superb && bullseye ? new Map([[key(clamp(aim)), 1]]) : scatterFrom(aim);
    for (const [cell, q] of spread) {
      const at = { x: cell % WIDTH, y: Math.floor(cell / WIDTH) };
      const [lands, worth] = comesDown(at, superb);
      value += p * q * worth;
      if (worth > 0) good += p * q * lands;
    }
  }
  if (carrying) value -= carrierStanding(c, mate.gridPosition!);
  const rolls: RollTarget[] = [
    { kind: "throw", target: odds.needed },
    { kind: "landing", target: mate.stats.AG + board.marks[key(aim)] },
  ];
  return {
    player: thrower,
    action: "throwTeamMate",
    intent: { kind: "throw-teammate", mate, aim, carrying },
    tier: tierFor(
      good as Chance,
      carrying ? w.safeScore : w.safeMove,
      "handoff"
    ),
    value,
    rolls,
  };
}

const throwable = (thrower: Player, mate: Player) =>
  mate.id !== thrower.id &&
  standing(mate) &&
  distance(mate.gridPosition!, thrower.gridPosition!) === 1 &&
  isRightStuffEligible(mate);

/** The best aim square to throw `mate` at, landing values priced once each. */
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
  // A carrier is only worth throwing towards the end zone.
  const ahead = (aim: Square) =>
    !carrying || toGoal(board, aim) < toGoal(board, mate.gridPosition!);
  let best: Activation | null = null;
  for (const aim of throwTeammateAims(thrower.gridPosition!).filter(ahead)) {
    const plan = throwAt(c, thrower, mate, aim, landing);
    if (!best || plan.value > best.value) best = plan;
  }
  return best;
}

/** The best aim square for each team-mate this player may throw. */
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
