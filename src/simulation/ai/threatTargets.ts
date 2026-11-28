import {
  type Board,
  type FieldPlayer as Player,
  carrierOf,
  distance,
} from "./board";
import { SkillType, hasSkill } from "../../types/Skills";
import { d6, withReroll } from "./chance";
import type { Weights } from "./weights";

export interface Removal {
  scorer: number;
  stopper: number;
}

const has = (p: Player, skill: SkillType) => hasSkill(p.skills, skill);
const count = (p: Player, skills: readonly SkillType[]) =>
  skills.filter((skill) => has(p, skill)).length;

const SQUARES_FOR_FULL_PACE = 10;
const THROW_NEEDS_A_RECEIVER = 0.5;
const STRENGTH_FOR_A_SURE_HIT = 4;
const TACKLER_BONUS = 0.25;

const UNRELIABLE: readonly (readonly [SkillType, number])[] = [
  [SkillType.REALLY_STUPID, 1 / 2],
  [SkillType.UNCHANNELLED_FURY, 1 / 2],
  [SkillType.ANIMAL_SAVAGERY, 1 / 2],
  [SkillType.BONE_HEAD, 5 / 6],
];

const HANDS = [SkillType.EXTRA_ARMS, SkillType.BIG_HAND] as const;
const SAFE_HANDS = [SkillType.SURE_HANDS, SkillType.CATCH] as const;
const TACKLERS = [
  SkillType.TACKLE,
  SkillType.STRIP_BALL,
  SkillType.DIVING_TACKLE,
] as const;

const rerolledIf = (p: number, skilled: boolean) =>
  skilled ? withReroll(p) : p;

function reach(p: Player): number {
  const sprint = has(p, SkillType.SPRINT) ? 1 : 0;
  const sureFeet = has(p, SkillType.SURE_FEET) ? 0.5 : 0;
  return p.stats.MA + 2 + sprint + sureFeet;
}

const pace = (p: Player) => Math.min(1, reach(p) / SQUARES_FOR_FULL_PACE);

function hands(p: Player): number {
  const pickup = d6(p.stats.AG - count(p, HANDS));
  return rerolledIf(pickup, count(p, SAFE_HANDS) > 0);
}

function evasion(p: Player): number {
  const marked = has(p, SkillType.STUNTY) ? 0 : 1;
  const titchy = has(p, SkillType.TITCHY) ? 1 : 0;
  const dodge = d6(p.stats.AG + marked - titchy);
  return (1 + rerolledIf(dodge, has(p, SkillType.DODGE))) / 2;
}

function passing(p: Player): number {
  if (p.stats.PA <= 0) return 0;
  const pass = rerolledIf(d6(p.stats.PA), has(p, SkillType.PASS));
  return THROW_NEEDS_A_RECEIVER * hands(p) * pass;
}

function reliability(p: Player): number {
  let left = 1;
  for (const [skill, share] of UNRELIABLE) if (has(p, skill)) left *= share;
  return left;
}

function nearLooseBall(board: Board, p: Player): boolean {
  return board.balls.some(
    (ball) =>
      ball.kind === "loose" && distance(ball.at, p.gridPosition) <= reach(p)
  );
}

function handler(board: Board, w: Weights, p: Player): number {
  if (has(p, SkillType.NO_BALL)) return 0;
  const running = hands(p) * pace(p) * evasion(p);
  const either = 1 - (1 - running) * (1 - passing(p));
  const ball = nearLooseBall(board, p) ? 1 + w.scorerNearBall : 1;
  return Math.min(1, reliability(p) * either * ball);
}

function stopper(p: Player): number {
  const hit =
    p.stats.ST / STRENGTH_FOR_A_SURE_HIT +
    (count(p, TACKLERS) > 0 ? TACKLER_BONUS : 0);
  return reliability(p) * pace(p) * Math.min(1, hit);
}

function lastOneShare(
  target: Player,
  mates: readonly Player[],
  quality: (p: Player) => number
): number {
  let share = quality(target);
  for (const mate of mates)
    if (mate.id !== target.id) share *= 1 - quality(mate);
  return share;
}

export function removalOf(board: Board, w: Weights, target: Player): Removal {
  const mates = board.theirs.filter((p) => p.teamId === target.teamId);
  const weHoldTheBall = carrierOf(board)?.teamId === board.us;
  return {
    scorer: lastOneShare(target, mates, (p) => handler(board, w, p)),
    stopper: weHoldTheBall ? lastOneShare(target, mates, stopper) : 0,
  };
}
