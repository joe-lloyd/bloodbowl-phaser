import { type Player, PlayerStatus } from "../../types/Player";
import { moveAllowance, standUpCost } from "../skills/movement";
import {
  movementNeighbors,
  movementTackleZones,
  occupiedSquare,
} from "./movementSquares";
import type { MovementSquare } from "./movementSquares";

interface SearchInput {
  start: MovementSquare;
  end: MovementSquare;
  player: Player;
  opponents: Player[];
  teammates: Player[];
  mode: "safe" | "direct";
  movementUsed: number;
}

function squareKey(square: MovementSquare): string {
  return `${String(square.x)},${String(square.y)}`;
}

function heuristic(
  node: MovementSquare,
  start: MovementSquare,
  end: MovementSquare
): number {
  const dx = Math.abs(node.x - end.x);
  const dy = Math.abs(node.y - end.y);
  const distance = dx + dy - Math.min(dx, dy);
  const cross = Math.abs(
    (node.x - end.x) * (start.y - end.y) - (start.x - end.x) * (node.y - end.y)
  );
  return distance + cross * 0.001;
}

export class MovementPathSearch {
  private readonly input;
  private readonly openSet: MovementSquare[];
  private readonly closedSet = new Set<string>();
  private readonly cameFrom = new Map<string, MovementSquare>();
  private readonly gScore = new Map<string, number>();
  private readonly stepsMap = new Map<string, number>();
  private readonly fScore = new Map<string, number>();
  private readonly maxSteps;
  private readonly occupants;

  constructor(input: SearchInput) {
    this.input = input;
    const startKey = squareKey(input.start);
    const steps =
      input.movementUsed +
      (input.player.status === PlayerStatus.PRONE
        ? standUpCost(input.player)
        : 0);
    this.gScore.set(startKey, 0);
    this.stepsMap.set(startKey, steps);
    this.fScore.set(startKey, heuristic(input.start, input.start, input.end));
    this.openSet = [input.start];
    this.maxSteps = moveAllowance(input.player);
    this.occupants = [...input.opponents, ...input.teammates];
  }

  find(): MovementSquare[] {
    for (let current = this.takeNext(); current; current = this.takeNext()) {
      if (current.x === this.input.end.x && current.y === this.input.end.y)
        return this.reconstruct(current);
      this.expand(current);
    }
    return [];
  }

  private takeNext(): MovementSquare | undefined {
    this.openSet.sort(
      (a, b) =>
        (this.fScore.get(squareKey(a)) ?? Infinity) -
        (this.fScore.get(squareKey(b)) ?? Infinity)
    );
    return this.openSet.shift();
  }

  private expand(current: MovementSquare): void {
    const currentKey = squareKey(current);
    this.closedSet.add(currentKey);
    const steps = this.stepsMap.get(currentKey) ?? 0;
    if (steps >= this.maxSteps) return;
    for (const neighbor of movementNeighbors(current)) {
      if (
        this.closedSet.has(squareKey(neighbor)) ||
        occupiedSquare(neighbor, this.occupants)
      )
        continue;
      const score =
        (this.gScore.get(currentKey) ?? 0) + this.stepCost(neighbor, steps);
      this.relax({ current, neighbor, score, steps: steps + 1 });
    }
  }

  private stepCost(square: MovementSquare, steps: number): number {
    const zones = movementTackleZones(square, this.input.opponents);
    const rush = steps + 1 > this.input.player.stats.MA ? 4 : 0;
    return this.input.mode === "safe" ? 1 + zones * 10 + rush : 100 + zones;
  }

  private relax(step: {
    current: MovementSquare;
    neighbor: MovementSquare;
    score: number;
    steps: number;
  }): void {
    const { current, neighbor, score, steps } = step;
    const key = squareKey(neighbor);
    if (score >= (this.gScore.get(key) ?? Infinity)) return;
    this.cameFrom.set(key, current);
    this.gScore.set(key, score);
    this.stepsMap.set(key, steps);
    this.fScore.set(
      key,
      score + heuristic(neighbor, this.input.start, this.input.end)
    );
    if (
      !this.openSet.some(
        (square) => square.x === neighbor.x && square.y === neighbor.y
      )
    )
      this.openSet.push(neighbor);
  }

  private reconstruct(current: MovementSquare): MovementSquare[] {
    const path = [current];
    for (
      let previous = this.cameFrom.get(squareKey(current));
      previous;
      previous = this.cameFrom.get(squareKey(previous))
    )
      path.unshift(previous);
    return path;
  }
}
