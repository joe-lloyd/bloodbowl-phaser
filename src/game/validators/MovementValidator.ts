import { Player, PlayerStatus } from "@/types/Player";
import { moveAllowance } from "../skills/movement";
import { GameConfig } from "@/config/GameConfig";

export interface MovementResult {
  valid: boolean;
  path: { x: number; y: number }[];
  rolls: MovementRoll[];
  cost: number;
}

export interface MovementRoll {
  type: "dodge" | "gfi" | "rush";
  target: number;
  modifiers: number;
  square: { x: number; y: number };
}

export class MovementValidator {
  private readonly WIDTH = GameConfig.PITCH_WIDTH;
  private readonly HEIGHT = GameConfig.PITCH_HEIGHT;

  /**
   * Find the optimal path for a player to a target square
   */
  findPath(
    player: Player,
    targetX: number,
    targetY: number,
    opponents: Player[],
    teammates: Player[]
  ): MovementResult {
    if (!player.gridPosition) {
      return this.invalidResult();
    }

    // 1. Basic validation
    if (!this.isInBounds(targetX, targetY)) {
      return this.invalidResult();
    }

    // 2. A move never enters an occupied square, whatever the occupant's
    // status. Getting past a Prone player is a Jump, a separate action.
    if (this.isOccupied(targetX, targetY, [...opponents, ...teammates])) {
      return this.invalidResult();
    }

    // 3. A* Pathfinding — safe route first; if avoiding tackle zones makes
    // the target unreachable within the step budget, take the direct route
    // through them (dodging is the player's choice to risk)
    const startNode = { x: player.gridPosition.x, y: player.gridPosition.y };
    const endNode = { x: targetX, y: targetY };

    let path = this.calculateAStarPath(
      startNode,
      endNode,
      player,
      opponents,
      teammates,
      "safe"
    );

    if (path.length === 0) {
      path = this.calculateAStarPath(
        startNode,
        endNode,
        player,
        opponents,
        teammates,
        "direct"
      );
    }

    if (path.length === 0) {
      return this.invalidResult();
    }

    // 4. Calculate rolls and validation
    return this.validatePath(player, path, opponents, teammates);
  }

  /**
   * Find all reachable squares for a player
   */
  findReachableSquares(
    player: Player,
    opponents: Player[],
    teammates: Player[]
  ): { x: number; y: number; cost: number }[] {
    if (!player.gridPosition) return [];

    const reachable: { x: number; y: number; cost: number }[] = [];
    const start = player.gridPosition;
    const maxMovement = moveAllowance(player);

    const queue: { x: number; y: number; cost: number }[] = [
      { x: start.x, y: start.y, cost: 0 },
    ];
    const visited = new Set<string>();
    visited.add(`${start.x},${start.y}`);

    while (queue.length > 0) {
      const current = queue.shift()!;

      // Add to reachable if not start
      if (current.cost > 0) {
        reachable.push({ x: current.x, y: current.y, cost: current.cost });
      }

      if (current.cost >= maxMovement) continue;

      const neighbors = this.getNeighbors(current.x, current.y);
      for (const neighbor of neighbors) {
        const key = `${neighbor.x},${neighbor.y}`;
        if (visited.has(key)) continue;

        // Prone and Stunned players block too: getting past one is a Jump,
        // a separate action, never a plain step.
        if (
          this.isOccupied(neighbor.x, neighbor.y, [...opponents, ...teammates])
        ) {
          continue;
        }

        visited.add(key);
        queue.push({ x: neighbor.x, y: neighbor.y, cost: current.cost + 1 });
      }
    }

    return reachable;
  }

  getTackleZones(x: number, y: number, opponents: Player[]): number {
    let count = 0;
    const neighbors = this.getNeighbors(x, y);
    for (const n of neighbors) {
      const opp = opponents.find(
        (p) =>
          p.gridPosition && p.gridPosition.x === n.x && p.gridPosition.y === n.y
      );
      if (opp && opp.status === PlayerStatus.ACTIVE) {
        count++;
      }
    }
    return count;
  }

  /**
   * @param mode "safe" prefers tackle-zone-free detours (pretty preview
   * path); "direct" minimizes steps with TZs only as a tiebreak. The safe
   * weighting can exhaust the MA+2 step budget on detours and find nothing —
   * callers should fall back to "direct" so any step-reachable square always
   * gets a path (the player may choose to dodge).
   */
  private calculateAStarPath(
    start: { x: number; y: number },
    end: { x: number; y: number },
    player: Player,
    opponents: Player[],
    teammates: Player[],
    mode: "safe" | "direct" = "safe"
  ): { x: number; y: number }[] {
    const openSet: { x: number; y: number }[] = [];
    const closedSet: Set<string> = new Set();
    const cameFrom: Map<string, { x: number; y: number }> = new Map();

    // gScore now represents "Weighted Safety Cost", NOT just distance
    const gScore: Map<string, number> = new Map();
    // stepsMap tracks actual movement steps (MA limit)
    const stepsMap: Map<string, number> = new Map();

    const fScore: Map<string, number> = new Map();

    const startKey = `${start.x},${start.y}`;

    // Stand Up Logic
    let stepsInternal = 0;
    if (player.status === PlayerStatus.PRONE) {
      // Cost to stand up is 3, or full MA if MA < 3
      stepsInternal = player.stats.MA < 3 ? player.stats.MA : 3;
    }

    gScore.set(startKey, 0); // Cost to reach start is 0, regardless of state? Or should it be cost?
    // Let's keep gScore as "movement points spent".
    // Actually, to prioritize "safe" paths, we want strict safety weights.
    // Standing up doesn't affect safety of the path itself.
    // But it limits range.
    stepsMap.set(startKey, stepsInternal);
    fScore.set(startKey, this.heuristic(start, end, start, end)); // Pass start/end for tie-breaker calc

    openSet.push(start);

    const maxSteps = moveAllowance(player); // GFI limit

    while (openSet.length > 0) {
      // Sort by fScore (lowest first)
      openSet.sort((a, b) => {
        const fa = fScore.get(`${a.x},${a.y}`) || Infinity;
        const fb = fScore.get(`${b.x},${b.y}`) || Infinity;
        return fa - fb;
      });

      const current = openSet.shift()!;
      const currentKey = `${current.x},${current.y}`;

      if (current.x === end.x && current.y === end.y) {
        return this.reconstructPath(cameFrom, current);
      }

      closedSet.add(currentKey);

      const currentSteps = stepsMap.get(currentKey) || 0;
      if (currentSteps >= maxSteps) continue; // Stop exploring if max MA reached

      const neighbors = this.getNeighbors(current.x, current.y);
      for (const neighbor of neighbors) {
        const neighborKey = `${neighbor.x},${neighbor.y}`;
        if (closedSet.has(neighborKey)) continue;

        // Every occupied square is impassable, Prone or Stunned included
        if (
          this.isOccupied(neighbor.x, neighbor.y, [...opponents, ...teammates])
        ) {
          continue;
        }

        // --- WEIGHT CALCULATION ---
        // safe: base 1 + 10 per TZ on the target square, so
        //       the pathfinder detours around tackle zones when it can.
        // direct: steps dominate, TZ count only breaks ties — guarantees a
        //         path to anything reachable within MA+2 steps.
        const tackleZones = this.getTackleZones(
          neighbor.x,
          neighbor.y,
          opponents
        );
        const stepCost =
          mode === "safe" ? 1 + tackleZones * 10 : 100 + tackleZones;

        const tentativeGScore = (gScore.get(currentKey) || 0) + stepCost;

        if (tentativeGScore < (gScore.get(neighborKey) || Infinity)) {
          cameFrom.set(neighborKey, current);
          gScore.set(neighborKey, tentativeGScore);
          stepsMap.set(neighborKey, currentSteps + 1);

          // Add heuristic with tie-breaker
          fScore.set(
            neighborKey,
            tentativeGScore + this.heuristic(neighbor, end, start, end)
          );

          if (!openSet.some((n) => n.x === neighbor.x && n.y === neighbor.y)) {
            openSet.push(neighbor);
          }
        }
      }
    }

    return [];
  }

  public validatePath(
    player: Player,
    path: { x: number; y: number }[],
    opponents: Player[],
    teammates: Player[] = []
  ): MovementResult {
    const rolls: MovementRoll[] = [];
    const ma = player.stats.MA;
    let valid = true;

    // Stand Up Logic
    let stepsAccumulator = 0;
    if (player.status === PlayerStatus.PRONE) {
      stepsAccumulator = player.stats.MA < 3 ? player.stats.MA : 3;
    }

    for (let i = 0; i < path.length - 1; i++) {
      const from = path[i];
      const to = path[i + 1];

      // Every step is to an adjacent, on-pitch, empty square; a step may
      // never skip squares. A Prone or Stunned player's square is occupied
      // too: crossing one is the separate Jump action, with its own roll.
      if (
        Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y)) !== 1 ||
        !this.isInBounds(to.x, to.y) ||
        this.isOccupied(to.x, to.y, [...opponents, ...teammates])
      ) {
        valid = false;
      }

      stepsAccumulator += 1;

      // Leaving a marked square is a Dodge
      const tackleZones = this.getTackleZones(from.x, from.y, opponents);
      if (tackleZones > 0) {
        const zonesInto = this.getTackleZones(to.x, to.y, opponents);
        const dodgeMods = zonesInto === 0 ? 0 : -zonesInto; // Avoid -0
        rolls.push({
          type: "dodge",
          target: player.stats.AG,
          modifiers: dodgeMods,
          square: to,
        });
      }

      if (stepsAccumulator > ma) {
        if (stepsAccumulator > moveAllowance(player)) {
          valid = false;
        }
        rolls.push({
          type: "rush",
          target: 2,
          modifiers: 0,
          square: to,
        });
      }
    }

    return {
      valid,
      path: path.slice(1),
      rolls,
      cost: path.length - 1,
    };
  }

  private reconstructPath(
    cameFrom: Map<string, { x: number; y: number }>,
    current: { x: number; y: number }
  ): { x: number; y: number }[] {
    const totalPath = [current];
    let currKey = `${current.x},${current.y}`;

    while (cameFrom.has(currKey)) {
      const prev = cameFrom.get(currKey)!;
      totalPath.unshift(prev);
      currKey = `${prev.x},${prev.y}`;
    }
    return totalPath;
  }

  private getNeighbors(x: number, y: number): { x: number; y: number }[] {
    const neighbors = [];
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        if (dx === 0 && dy === 0) continue;
        if (this.isInBounds(x + dx, y + dy)) {
          neighbors.push({ x: x + dx, y: y + dy });
        }
      }
    }
    return neighbors;
  }

  private isInBounds(x: number, y: number): boolean {
    return x >= 0 && x < this.WIDTH && y >= 0 && y < this.HEIGHT;
  }

  /** Any player on the square blocks it, whatever their status. */
  private isOccupied(x: number, y: number, players: Player[]): boolean {
    return players.some(
      (p) => p.gridPosition && p.gridPosition.x === x && p.gridPosition.y === y
    );
  }

  private heuristic(
    node: { x: number; y: number },
    end: { x: number; y: number },
    pathStart: { x: number; y: number },
    pathEnd: { x: number; y: number }
  ): number {
    // Base: Chebyshev distance (diagonal = 1)
    const dXx = Math.abs(node.x - end.x);
    const dYy = Math.abs(node.y - end.y);
    const D = 1;
    const D2 = 1;

    const h = D * (dXx + dYy) + (D2 - 2 * D) * Math.min(dXx, dYy);

    // Tie-Breaker: Nudge towards straight line
    // Cross-product magnitude of vector (start->end) vs (start->node)
    const dx1 = node.x - pathEnd.x;
    const dy1 = node.y - pathEnd.y;
    const dx2 = pathStart.x - pathEnd.x;
    const dy2 = pathStart.y - pathEnd.y;
    const cross = Math.abs(dx1 * dy2 - dx2 * dy1);

    return h + cross * 0.001;
  }

  /**
   * Analyze a path for dodge requirements
   * Used by GameplayInteractionController to detect dodges before execution
   */
  public analyzePath(
    player: Player,
    path: { x: number; y: number }[],
    opponents: Player[]
  ): {
    dodgeSquares: { x: number; y: number; modifiers: number }[];
    requiresDodge: boolean;
  } {
    const dodgeSquares: { x: number; y: number; modifiers: number }[] = [];

    for (let i = 0; i < path.length - 1; i++) {
      const from = path[i];
      const to = path[i + 1];

      // Check if leaving a tackle zone
      const leavingTZ = this.getTackleZones(from.x, from.y, opponents) > 0;

      if (leavingTZ) {
        // Calculate modifiers for destination
        const zonesInto = this.getTackleZones(to.x, to.y, opponents);
        const modifiers = -zonesInto;

        dodgeSquares.push({
          x: to.x,
          y: to.y,
          modifiers,
        });
      }
    }

    return {
      dodgeSquares,
      requiresDodge: dodgeSquares.length > 0,
    };
  }

  private invalidResult(): MovementResult {
    return { valid: false, path: [], rolls: [], cost: 0 };
  }
}
