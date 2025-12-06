import { Player, PlayerStatus } from '@/types/Player';

export interface MovementResult {
    valid: boolean;
    path: { x: number, y: number }[];
    rolls: MovementRoll[];
    cost: number;
}

export interface MovementRoll {
    type: 'dodge' | 'gfi' | 'rush';
    target: number;
    modifiers: number;
    square: { x: number, y: number };
}

export class MovementValidator {
    private readonly WIDTH = 26;
    private readonly HEIGHT = 15;

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

        // 2. Check if occupied by standing player
        if (this.isOccupiedByStanding(targetX, targetY, [...opponents, ...teammates])) {
            return this.invalidResult();
        }

        // 3. A* Pathfinding
        const startNode = { x: player.gridPosition.x, y: player.gridPosition.y };
        const endNode = { x: targetX, y: targetY };

        const path = this.calculateAStarPath(startNode, endNode, player, opponents, teammates);

        if (path.length === 0) {
            return this.invalidResult();
        }

        // 4. Calculate rolls and validation
        return this.validatePath(player, path, opponents);
    }


    /**
     * Find all reachable squares for a player
     */
    findReachableSquares(
        player: Player,
        opponents: Player[],
        teammates: Player[]
    ): { x: number, y: number }[] {
        if (!player.gridPosition) return [];

        const reachable: { x: number, y: number }[] = [];
        const start = player.gridPosition;
        const maxMovement = player.stats.MA + 2;

        const queue: { x: number, y: number, cost: number }[] = [{ x: start.x, y: start.y, cost: 0 }];
        const visited = new Set<string>();
        visited.add(`${start.x},${start.y}`);

        while (queue.length > 0) {
            const current = queue.shift()!;

            // Add to reachable if not start
            if (current.cost > 0) {
                reachable.push({ x: current.x, y: current.y });
            }

            if (current.cost >= maxMovement) continue;

            const neighbors = this.getNeighbors(current.x, current.y);
            for (const neighbor of neighbors) {
                const key = `${neighbor.x},${neighbor.y}`;
                if (visited.has(key)) continue;

                // Check occupation
                if (this.isOccupiedByStanding(neighbor.x, neighbor.y, [...opponents, ...teammates])) {
                    continue; // Cannot move THROUGH or INTO occupied square
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
            const opp = opponents.find(p => p.gridPosition && p.gridPosition.x === n.x && p.gridPosition.y === n.y);
            if (opp && opp.status === PlayerStatus.ACTIVE) {
                count++;
            }
        }
        return count;
    }

    private calculateAStarPath(
        start: { x: number, y: number },
        end: { x: number, y: number },
        player: Player,
        opponents: Player[],
        teammates: Player[]
    ): { x: number, y: number }[] {
        const openSet: { x: number, y: number }[] = [];
        const closedSet: Set<string> = new Set();
        const cameFrom: Map<string, { x: number, y: number }> = new Map();

        // gScore now represents "Weighted Safety Cost", NOT just distance
        const gScore: Map<string, number> = new Map();
        // stepsMap tracks actual movement steps (MA limit)
        const stepsMap: Map<string, number> = new Map();

        const fScore: Map<string, number> = new Map();

        const startKey = `${start.x},${start.y}`;
        gScore.set(startKey, 0);
        stepsMap.set(startKey, 0);
        fScore.set(startKey, this.heuristic(start, end, start, end)); // Pass start/end for tie-breaker calc

        openSet.push(start);

        const maxSteps = player.stats.MA + 2; // GFI limit

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

                // Occupation check
                if (this.isOccupiedByStanding(neighbor.x, neighbor.y, [...opponents, ...teammates])) {
                    continue;
                }

                // --- WEIGHT CALCULATION ---
                // Base cost = 1
                // Tackle Zone Penalty = 10 per TZ *on the target square*
                // This makes the pathfinder avidly avoid TZs unless necessary.
                const tackleZones = this.getTackleZones(neighbor.x, neighbor.y, opponents);
                const stepCost = 1 + (tackleZones * 10);

                const tentativeGScore = (gScore.get(currentKey) || 0) + stepCost;

                if (tentativeGScore < (gScore.get(neighborKey) || Infinity)) {
                    cameFrom.set(neighborKey, current);
                    gScore.set(neighborKey, tentativeGScore);
                    stepsMap.set(neighborKey, currentSteps + 1);

                    // Add heuristic with tie-breaker
                    fScore.set(neighborKey, tentativeGScore + this.heuristic(neighbor, end, start, end));

                    if (!openSet.some(n => n.x === neighbor.x && n.y === neighbor.y)) {
                        openSet.push(neighbor);
                    }
                }
            }
        }

        return [];
    }

    public validatePath(player: Player, path: { x: number, y: number }[], opponents: Player[]): MovementResult {
        const rolls: MovementRoll[] = [];
        const ma = player.stats.MA;
        let valid = true;

        for (let i = 0; i < path.length - 1; i++) {
            const from = path[i];
            const to = path[i + 1];
            const stepsTaken = i + 1;

            const tackleZones = this.getTackleZones(from.x, from.y, opponents);
            if (tackleZones > 0) {
                const zonesInto = this.getTackleZones(to.x, to.y, opponents);
                // Dodge: +1 modifier, -1 per enemy TZ on target
                let dodgeMods = 1 - zonesInto;

                rolls.push({
                    type: 'dodge',
                    target: player.stats.AG,
                    modifiers: dodgeMods,
                    square: to
                });
            }

            if (stepsTaken > ma) {
                if (stepsTaken > ma + 2) {
                    valid = false;
                }
                rolls.push({
                    type: 'rush',
                    target: 2,
                    modifiers: 0,
                    square: to
                });
            }
        }

        return {
            valid,
            path: path.slice(1),
            rolls,
            cost: path.length - 1
        };
    }

    private reconstructPath(cameFrom: Map<string, { x: number, y: number }>, current: { x: number, y: number }): { x: number, y: number }[] {
        const totalPath = [current];
        let currKey = `${current.x},${current.y}`;

        while (cameFrom.has(currKey)) {
            const prev = cameFrom.get(currKey)!;
            totalPath.unshift(prev);
            currKey = `${prev.x},${prev.y}`;
        }
        return totalPath;
    }

    private getNeighbors(x: number, y: number): { x: number, y: number }[] {
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

    private isOccupiedByStanding(x: number, y: number, players: Player[]): boolean {
        return players.some(p =>
            p.gridPosition &&
            p.gridPosition.x === x &&
            p.gridPosition.y === y &&
            (p.status === PlayerStatus.ACTIVE)
        );
    }

    private heuristic(
        node: { x: number, y: number },
        end: { x: number, y: number },
        pathStart: { x: number, y: number },
        pathEnd: { x: number, y: number }
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

        return h + (cross * 0.001);
    }

    private invalidResult(): MovementResult {
        return { valid: false, path: [], rolls: [], cost: 0 };
    }
}
