import { NumberTable } from "./numberTable";
import { type FieldPlayer as Player } from "./board";
import {
  type Player as RosterPlayer,
  PlayerStatus,
  hasTackleZone,
} from "../../types/Player";
import { SkillType, hasSkill } from "../../types/Skills";
import { requiredRoll } from "../../game/rules/rollTargets";
import { pickupTarget, secureBallTarget } from "../../game/rules/rollPreview";
import { weatherEffects } from "../../game/rules/weather";
import { rushAllowance, standUpCost } from "../../game/skills/movement";
import { withDriveModifiers } from "../../game/kickoff/driveEffects";
import {
  type Board,
  HEIGHT,
  type Square,
  WIDTH,
  distance,
  key,
  neighbours,
} from "./board";
import { CERTAIN, type Chance, type RollTarget, chain } from "./chance";

const NO_ROLLS: RollTarget[] = [];

export interface Route {
  to: Square;

  path: Square[];
  rolls: RollTarget[];
  chance: Chance;
}

const CELLS = WIDTH * HEIGHT;
const square = (k: number): Square => ({
  x: k % WIDTH,
  y: Math.floor(k / WIDTH),
});

interface StepRollsArgs {
  board: Board;
  player: Player;
  from: Square;
  to: Square;
  rush: boolean;
  securing: boolean;
}

function stepRolls({
  board,
  player,
  from,
  to,
  rush,
  securing,
}: StepRollsArgs): RollTarget[] {
  const rolls: RollTarget[] = [];
  if (rush)
    rolls.push({
      kind: "rush",
      target: requiredRoll(2, weatherEffects(board.weather).rush),
    });
  if (board.marks.getUint8(key(from)) > 0) {
    rolls.push(dodgeRoll(board, player, { from, to }));
  }
  if (board.ball.kind === "loose" && key(board.ball.at) === key(to))
    rolls.push({
      kind: securing ? "secure" : "pickup",
      target: (securing ? secureBallTarget : pickupTarget)(
        player,
        to,
        board.theirs,
        board.weather
      ),
    });
  return rolls;
}

export function movesLeft(
  board: Board,
  player: RosterPlayer,
  extraUsed = 0
): [number, number] {
  const fielded = withDriveModifiers(player, board.gs.getState());
  let used = board.gs.getMovementUsed(player.id) + extraUsed;
  if (player.status === PlayerStatus.PRONE) used += standUpCost(fielded);
  const ma = fielded.stats.MA;
  const rushes = rushAllowance(fielded) - Math.max(0, used - ma);
  return [Math.max(0, ma - used), Math.max(0, rushes)];
}

const MAX_STEPS = 16;
const bestAt = new NumberTable(MAX_STEPS + 1, CELLS);
const parentAt = new NumberTable(MAX_STEPS + 1, CELLS);

const NEIGHBOURS = Array.from({ length: CELLS }, (_, cell) =>
  neighbours(square(cell)).map(key)
);

const rollChance = (target: number) =>
  (7 - Math.min(6, Math.max(2, target))) / 6;

interface Search {
  board: Board;

  ballKey: number;
  rush: number;

  dodgeInto: DataView;
  pickup: number;
}

function dodgeBonus(player: Player): number {
  return (
    (hasSkill(player.skills, SkillType.TWO_HEADS) ? 1 : 0) +
    (hasSkill(player.skills, SkillType.TITCHY) ? 1 : 0)
  );
}

function searchFor(board: Board, player: Player, securing: boolean): Search {
  const ballKey = board.ball.kind === "loose" ? key(board.ball.at) : -1;

  const rush = rollChance(requiredRoll(2, weatherEffects(board.weather).rush));
  const stunty = hasSkill(player.skills, SkillType.STUNTY);
  const twoHeads = dodgeBonus(player);
  const dodgeInto = new DataView(new ArrayBuffer(9 * 8));
  for (let marks = 0; marks < 9; marks++)
    dodgeInto.setFloat64(
      marks * 8,
      rollChance(
        requiredRoll(player.stats.AG, (stunty ? 0 : -marks) + twoHeads)
      )
    );
  const pickup =
    ballKey >= 0
      ? rollChance(
          (securing ? secureBallTarget : pickupTarget)(
            player,
            square(ballKey),
            board.theirs,
            board.weather
          )
        )
      : 1;
  return { board, ballKey, rush, dodgeInto, pickup };
}

interface RelaxArgs {
  search: Search;
  k: number;
  cell: number;
  p: number;
  stepRush: number;
  neighbours: number[];
}

function relax({ search, k, cell, p, stepRush, neighbours }: RelaxArgs): void {
  const { board, ballKey } = search;
  const leavesZone = board.marks.getUint8(cell) > 0;
  for (const next of neighbours) {
    if (board.occupant[next]) continue;
    let chance = stepRush;
    if (leavesZone)
      chance *= search.dodgeInto.getFloat64(board.marks.getUint8(next) * 8);
    if (next === ballKey) chance *= search.pickup;
    const q = p * chance;
    if (q > bestAt.get(k + 1, next)) {
      bestAt.set(k + 1, next, q);
      parentAt.set(k + 1, next, cell);
    }
  }
}

interface SpreadArgs {
  search: Search;
  start: Square;
  steps: number;
  normal: number;
}

function spread({ search, start, steps, normal }: SpreadArgs): void {
  bestAt.fillRows(steps + 1, -1);
  bestAt.set(0, key(start), 1);
  for (let k = 0; k < steps; k++) {
    const stepRush = k >= normal ? search.rush : 1;
    for (const [cell, neighbours] of NEIGHBOURS.entries()) {
      const p = bestAt.get(k, cell);
      if (p < 0 || (cell === search.ballKey && k > 0)) continue;
      relax({
        search: search,
        k: k,
        cell: cell,
        p: p,
        stepRush: stepRush,
        neighbours,
      });
    }
  }
}

function pathTo(cell: number, steps: number): Square[] {
  const path: Square[] = [];
  for (let k = steps, c = cell; k > 0; c = parentAt.get(k, c), k--)
    path.push(square(c));
  return path.reverse();
}

function bestStepCount(cell: number, steps: number): number {
  let bestK = -1;
  for (let k = 1; k <= steps; k++)
    if (bestAt.get(k, cell) > (bestK < 0 ? 0 : bestAt.get(bestK, cell) + 1e-9))
      bestK = k;
  return bestK;
}

interface PathRollsArgs {
  board: Board;
  player: Player;
  start: Square;
  path: Square[];
  normal: number;
  securing: boolean;
}

function pathRolls({
  board,
  player,
  start,
  path,
  normal,
  securing,
}: PathRollsArgs): RollTarget[] {
  const rolls: RollTarget[] = [];
  let from = start;
  for (const [i, to] of path.entries()) {
    rolls.push(
      ...stepRolls({
        board: board,
        player: player,
        from: from,
        to,
        rush: i >= normal,
        securing: securing,
      })
    );
    from = to;
  }
  return rolls;
}

interface RoutesForArgs {
  board: Board;
  player: Player;
  securing?: boolean;
  extraUsed?: number;
}

export function routesFor({
  board,
  player,
  securing = false,
  extraUsed = 0,
}: RoutesForArgs): Map<number, Route> {
  const start = player.gridPosition;
  const [normal, rushes] = movesLeft(board, player, extraUsed);
  const steps = Math.min(MAX_STEPS, normal + rushes);
  spread({
    search: searchFor(board, player, securing),
    start: start,
    steps: steps,
    normal: normal,
  });

  const out = new Map<number, Route>();
  for (let cell = 0; cell < CELLS; cell++) {
    if (cell === key(start)) continue;
    const bestK = bestStepCount(cell, steps);
    if (bestK < 0) continue;
    const path = pathTo(cell, bestK);

    const rolls =
      bestAt.get(bestK, cell) === 1
        ? NO_ROLLS
        : pathRolls({
            board: board,
            player: player,
            start: start,
            path: path,
            normal: normal,
            securing: securing,
          });
    out.set(cell, {
      to: square(cell),
      path,
      rolls,
      chance: rolls.length
        ? chain({
            player: player,
            rolls: rolls,
            teamReroll: false,
            available: (skill) =>
              board.gs.getRerollArbiter().skillRerollAvailable(player, skill),
          })
        : CERTAIN,
    });
  }
  return out;
}

export function withTeamReroll(
  routes: Map<number, Route>,
  player: RosterPlayer,
  available?: (skill: SkillType) => boolean
): Map<number, Route> {
  const out = new Map<number, Route>();
  for (const [cell, route] of routes)
    out.set(
      cell,
      route.rolls.length
        ? {
            ...route,
            chance: chain({
              player: player,
              rolls: route.rolls,
              teamReroll: true,
              available: available,
            }),
          }
        : route
    );
  return out;
}

function dodgeRoll(
  board: Board,
  player: Player,
  { from, to }: { from: Square; to: Square }
): RollTarget {
  const modifier = hasSkill(player.skills, SkillType.STUNTY)
    ? 0
    : -board.marks.getUint8(key(to));
  const twoHeads = dodgeBonus(player);
  const tackled = board.theirs.some(
    (o) =>
      hasTackleZone(o) &&
      hasSkill(o.skills, SkillType.TACKLE) &&
      distance(o.gridPosition, from) === 1
  );
  return {
    kind: "dodge",
    target: requiredRoll(player.stats.AG, modifier + twoHeads),
    ...(tackled ? { noSkillReroll: true as const } : {}),
  };
}
