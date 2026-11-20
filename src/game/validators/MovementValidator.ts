import { activeRules } from "@/game/variants/activeMatch";
import { type Player, PlayerStatus } from "@/types/Player";
import { moveAllowance, standUpCost } from "../skills/movement";
import { GameConfig } from "@/config/GameConfig";
import { MovementPathSearch } from "./MovementPathSearch";
import {
  adjacentPathSteps,
  movementTackleZones,
  occupiedSquare,
} from "./movementSquares";
import { isOnPitch, isStandableSquare } from "../rules/pitchSquares";
import type { MovementSquare } from "./movementSquares";
import type { MoveStep } from "../../headless/protocol";
import {
  RECKLESS_CROSSING_TARGET,
  crossingAt,
  planCrossings,
  stepCost,
} from "../rules/barricades";

export interface MovementResult {
  valid: boolean;
  path: MoveStep[];
  rolls: MovementRoll[];
  cost: number;
}

interface MovementRoll {
  type: "dodge" | "gfi" | "rush" | "barricade";
  target: number;
  modifiers: number;
  square: MovementSquare;
}

interface PathInput {
  player: Player;
  path: MoveStep[];
  opponents: Player[];
  teammates?: Player[] | undefined;
  movementUsed?: number | undefined;
}

type ReachableSquare = MovementSquare & { cost: number };

function standingCost(player: Player): number {
  return player.status === PlayerStatus.PRONE ? standUpCost(player) : 0;
}

function invalidResult(): MovementResult {
  return { valid: false, path: [], rolls: [], cost: 0 };
}

function pitchSquare(square: MovementSquare): boolean {
  return (
    Number.isInteger(square.x) &&
    Number.isInteger(square.y) &&
    isStandableSquare(square)
  );
}

function validStep(
  from: MovementSquare,
  to: MovementSquare,
  occupants: Player[]
): boolean {
  return (
    Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y)) === 1 &&
    isStandableSquare(to) &&
    !occupiedSquare(to, occupants)
  );
}

function stepRolls(input: {
  from: MovementSquare;
  to: MovementSquare;
  player: Player;
  opponents: Player[];
  steps: number;
}): MovementRoll[] {
  const { from, to, player, opponents, steps } = input;
  const rolls: MovementRoll[] = [];
  if (movementTackleZones(from, opponents) > 0) {
    const zonesInto = movementTackleZones(to, opponents);
    rolls.push({
      type: "dodge",
      target: player.stats.AG,
      modifiers: zonesInto === 0 ? 0 : -zonesInto,
      square: to,
    });
  }
  if (steps > player.stats.MA)
    rolls.push({
      type: "rush",
      target: activeRules().rushTarget,
      modifiers: 0,
      square: to,
    });
  return rolls;
}

export class MovementValidator {
  findPath(input: {
    player: Player;
    targetX: number;
    targetY: number;
    opponents: Player[];
    teammates: Player[];
    movementUsed?: number | undefined;
  }): MovementResult {
    const {
      player,
      targetX,
      targetY,
      opponents,
      teammates,
      movementUsed = 0,
    } = input;
    if (!player.gridPosition) return invalidResult();
    const end = { x: targetX, y: targetY };
    if (
      !isStandableSquare(end) ||
      occupiedSquare(end, [...opponents, ...teammates])
    )
      return invalidResult();
    const start = { x: player.gridPosition.x, y: player.gridPosition.y };
    const search = { start, end, player, opponents, teammates, movementUsed };
    let path = new MovementPathSearch({ ...search, mode: "safe" }).find();
    if (path.length === 0)
      path = new MovementPathSearch({ ...search, mode: "direct" }).find();
    if (path.length === 0) return invalidResult();
    const [first, ...steps] = path;
    if (!first) return invalidResult();
    const planned = planCrossings(first, steps, {
      used: movementUsed + standingCost(player),
      ma: player.stats.MA,
    });
    return this.validatePath({
      player,
      path: [first, ...planned],
      opponents,
      teammates,
      movementUsed,
    });
  }

  findReachableSquares(
    player: Player,
    opponents: Player[],
    teammates: Player[]
  ): ReachableSquare[] {
    const start = player.gridPosition;
    if (!start || !pitchSquare(start)) return [];
    const reachable: ReachableSquare[] = [];
    const maxMovement = moveAllowance(player);
    const width = GameConfig.PITCH_WIDTH;
    const blocked = new Uint8Array(width * GameConfig.PITCH_HEIGHT);
    for (const occupant of [...opponents, ...teammates]) {
      const at = occupant.gridPosition;
      if (at && isOnPitch(at)) blocked[at.y * width + at.x] = 1;
    }
    blocked[start.y * width + start.x] = 1;
    const queue: ReachableSquare[] = [{ x: start.x, y: start.y, cost: 0 }];
    for (const current of queue) {
      if (current.cost > 0) reachable.push({ ...current });
      if (current.cost < maxMovement) this.flood(current, blocked, queue);
    }
    return reachable;
  }

  private flood(
    current: ReachableSquare,
    blocked: Uint8Array,
    queue: ReachableSquare[]
  ): void {
    const width = GameConfig.PITCH_WIDTH;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const x = current.x + dx;
        const y = current.y + dy;
        if (!isStandableSquare({ x, y }) || blocked[y * width + x]) continue;
        blocked[y * width + x] = 1;
        queue.push({ x, y, cost: current.cost + 1 });
      }
    }
  }

  validatePath({
    player,
    path,
    opponents,
    teammates = [],
    movementUsed = 0,
  }: PathInput): MovementResult {
    const rolls: MovementRoll[] = [];
    let valid = true;
    let steps = movementUsed + standingCost(player);
    const occupants = [...opponents, ...teammates];
    for (const { from, to } of adjacentPathSteps(path)) {
      const crossing = crossingAt({
        from,
        step: to,
        used: steps,
        ma: player.stats.MA,
      });
      steps++;
      if (!validStep(from, to, occupants) || steps > moveAllowance(player))
        valid = false;
      rolls.push(...stepRolls({ from, to, player, opponents, steps }));
      if (crossing === "reckless")
        rolls.push({
          type: "barricade",
          target: RECKLESS_CROSSING_TARGET,
          modifiers: 0,
          square: to,
        });
      steps += stepCost(crossing) - 1;
    }
    return { valid, path: path.slice(1), rolls, cost: path.length - 1 };
  }
}
