import { IEventBus } from '../EventBus';
import { GameState } from '@/types/GameState';
import { Team } from '@/types/Team';
import { Player, PlayerStatus } from '@/types/Player';
import { MovementValidator } from '../../game/validators/MovementValidator';
import { BallManager } from './BallManager';

export class MovementManager {
    private movementValidator: MovementValidator = new MovementValidator();

    constructor(
        private eventBus: IEventBus,
        private state: GameState,
        private team1: Team,
        private team2: Team,
        private ballManager: BallManager,
        private callbacks: {
            onTurnover: (reason: string) => void,
            onActivationFinished: (playerId: string) => void
        }
    ) { }

    public getMovementUsed(playerId: string): number {
        return this.state.turn.movementUsed.get(playerId) || 0;
    }

    public getAvailableMovements(playerId: string): { x: number; y: number; cost?: number }[] {
        const player = this.getPlayerById(playerId);
        if (!player || player.teamId !== this.state.activeTeamId) return [];

        const used = this.getMovementUsed(playerId);
        const ma = player.stats.MA;
        const remainingMA = Math.max(0, ma - used);

        if (used >= ma + 2) return [];

        const team = (player.teamId === this.team1.id) ? this.team1 : this.team2;
        const opponentTeam = (player.teamId === this.team1.id) ? this.team2 : this.team1;

        const opponents = opponentTeam.players.filter((p: any) => p.gridPosition);
        const teammates = team.players.filter((p: any) => p.gridPosition && p.id !== player.id);

        const proxyPlayer = {
            ...player,
            stats: {
                ...player.stats,
                MA: remainingMA
            }
        };

        return this.movementValidator.findReachableSquares(proxyPlayer as Player, opponents, teammates);
    }

    public async movePlayer(playerId: string, path: { x: number; y: number }[]): Promise<void> {
        const player = this.getPlayerById(playerId);
        if (!player) return Promise.reject('Player not found!');

        const oppTeam = (player.teamId === this.team1.id) ? this.team2 : this.team1;
        const opponents = oppTeam.players.filter(p => p.status === PlayerStatus.ACTIVE && p.gridPosition);

        // Validate
        const result = this.movementValidator.validatePath(player, [{ x: player.gridPosition!.x, y: player.gridPosition!.y }, ...path], opponents);
        if (!result.valid) {
            console.warn(`Invalid move attempted for player ${playerId}`);
            return Promise.reject('Invalid Move');
        }

        let currentPos = player.gridPosition!;
        const completedPath: { x: number; y: number }[] = [];
        let failed = false;
        let stepsTaken = 0;

        // Stand Up
        if (player.status === PlayerStatus.PRONE) {
            stepsTaken += (player.stats.MA < 3) ? player.stats.MA : 3;
            player.status = PlayerStatus.ACTIVE;
            this.eventBus.emit('playerStatusChanged', player);
        }

        const preUsed = this.getMovementUsed(playerId);

        // Check if starting with ball
        let holdingBall = false;
        if (this.state.ballPosition && player.gridPosition &&
            this.state.ballPosition.x === player.gridPosition.x &&
            this.state.ballPosition.y === player.gridPosition.y) {
            holdingBall = true;
        }

        for (const step of path) {
            if (failed) break;

            stepsTaken++;
            const totalUsed = preUsed + stepsTaken;

            // Check for GFI
            if (totalUsed > player.stats.MA) {
                let target = 2; // Always 2+ for GFI
                const roll = Math.floor(Math.random() * 6) + 1;
                const success = roll >= target;

                this.eventBus.emit('diceRoll', {
                    rollType: 'Rush (GFI)',
                    diceType: 'd6',
                    value: roll,
                    total: roll,
                    description: `Rush Roll (Target ${target}+): ${success ? 'Success' : 'FAILURE'}`,
                    passed: success
                });

                if (!success) {
                    failed = true;
                    currentPos = step;
                    player.gridPosition = currentPos;

                    console.log("GFI FAILED! Player trips.");
                    player.status = PlayerStatus.PRONE;
                    this.eventBus.emit('playerStatusChanged', player);

                    this.callbacks.onTurnover("Failed GFI");
                    completedPath.push(step);
                    break;
                }
            }

            // Move
            currentPos = step;
            completedPath.push(step);

            // Pickup Attempt
            if (!holdingBall && this.state.ballPosition &&
                currentPos.x === this.state.ballPosition.x &&
                currentPos.y === this.state.ballPosition.y) {

                const pickupSuccess = this.ballManager.attemptPickup(player, currentPos);
                if (pickupSuccess) {
                    holdingBall = true;
                } else {
                    failed = true;
                    break; // Turnover handled in BallManager
                }
            }

            // Move Ball
            if (holdingBall) {
                this.state.ballPosition = { x: currentPos.x, y: currentPos.y };
                this.eventBus.emit('ballPlaced', { x: currentPos.x, y: currentPos.y });
            }
        }

        // Finalize
        player.gridPosition = currentPos;
        this.state.turn.movementUsed.set(playerId, preUsed + stepsTaken);

        this.eventBus.emit('playerMoved', {
            playerId,
            from: result.path[0] || { x: player.gridPosition.x, y: player.gridPosition.y },
            to: currentPos,
            path: completedPath
        });

        // Auto-finish if exhausted
        if (preUsed + stepsTaken >= player.stats.MA + 2) {
            this.callbacks.onActivationFinished(playerId);
        }

        return Promise.resolve();
    }

    private getPlayerById(playerId: string): Player | undefined {
        return (
            this.team1.players.find((p) => p.id === playerId) ||
            this.team2.players.find((p) => p.id === playerId)
        );
    }
}
