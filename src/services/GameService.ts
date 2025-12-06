/**
 * GameService - Core game logic service
 * 
 * Pure TypeScript implementation with no Phaser dependencies.
 * Manages game state, phase transitions, and turn management.
 */

import { IGameService } from './interfaces/IGameService.js';
import { IEventBus } from './EventBus.js';
import { GameState, GamePhase } from '@/types/GameState';
import { Team } from '@/types/Team';
import { Player, PlayerStatus } from '@/types/Player';
import { MovementValidator } from '../domain/validators/MovementValidator.js';
import { ActionValidator } from '../domain/validators/ActionValidator.js';

export class GameService implements IGameService {
    private state: GameState;
    private team1: Team;
    private team2: Team;
    private maxTurns: number = 6; // Sevens default
    private turnCounts: { [key: string]: number } = {};
    private placedPlayers: Map<string, { x: number; y: number }> = new Map();
    private setupReady: Set<string> = new Set();

    // Validators
    private movementValidator: MovementValidator = new MovementValidator();
    private actionValidator: ActionValidator = new ActionValidator();

    constructor(
        private eventBus: IEventBus,
        team1: Team,
        team2: Team
    ) {
        this.team1 = team1;
        this.team2 = team2;

        this.turnCounts = {
            [team1.id]: 0,
            [team2.id]: 0,
        };

        this.state = {
            phase: GamePhase.SETUP,
            activeTeamId: null,
            turn: {
                teamId: '',
                turnNumber: 0,
                isHalf2: false,
                activatedPlayerIds: new Set(),
                hasBlitzed: false,
                hasPassed: false,
                hasHandedOff: false,
                hasFouled: false,
            },
            score: {
                [team1.id]: 0,
                [team2.id]: 0,
            },
        };
    }

    // ===== State Queries =====

    getState(): GameState {
        return this.state;
    }

    getPhase(): GamePhase {
        return this.state.phase;
    }

    getActiveTeamId(): string | null {
        return this.state.activeTeamId;
    }

    getTurnNumber(teamId: string): number {
        return this.turnCounts[teamId] || 0;
    }

    // ===== Setup Phase =====

    startSetup(startingTeamId?: string): void {
        this.state.phase = GamePhase.SETUP;
        if (startingTeamId) {
            this.state.activeTeamId = startingTeamId;
        }
        this.eventBus.emit('phaseChanged', { phase: GamePhase.SETUP });
    }

    placePlayer(playerId: string, x: number, y: number): boolean {
        if (this.state.phase !== GamePhase.SETUP) return false;

        // Validate position
        if (!this.isValidSetupPosition(playerId, x, y)) return false;

        // Check if occupied by another player
        if (this.isSquareOccupiedByOther(x, y, playerId)) return false;

        // Check limit (7 players)
        const player = this.getPlayerById(playerId);
        if (!player) return false;

        const teamId = player.teamId;
        const teamPlacedCount = this.getPlacedCount(teamId);

        // If moving existing player, don't count against limit
        const isNewPlacement = !this.placedPlayers.has(playerId);
        if (isNewPlacement && teamPlacedCount >= 7) return false;

        this.placedPlayers.set(playerId, { x, y });
        player.gridPosition = { x, y };

        this.eventBus.emit('playerPlaced', { playerId, x, y });
        return true;
    }

    removePlayer(playerId: string): void {
        if (this.placedPlayers.has(playerId)) {
            this.placedPlayers.delete(playerId);
            const player = this.getPlayerById(playerId);
            if (player) player.gridPosition = undefined;

            this.eventBus.emit('playerRemoved', playerId);
        }
    }

    swapPlayers(player1Id: string, player2Id: string): boolean {
        if (this.state.phase !== GamePhase.SETUP) return false;

        const pos1 = this.placedPlayers.get(player1Id);
        const pos2 = this.placedPlayers.get(player2Id);

        if (!pos1 && !pos2) return false;

        // Update positions
        if (pos1) {
            if (pos2) {
                // Both placed: Swap coordinates
                this.placedPlayers.set(player1Id, pos2);
                this.placedPlayers.set(player2Id, pos1);
            } else {
                // P1 placed, P2 in dugout: Move P2 to P1's spot, remove P1
                this.placedPlayers.set(player2Id, pos1);
                this.placedPlayers.delete(player1Id);
            }
        } else if (pos2) {
            // P2 placed, P1 in dugout: Move P1 to P2's spot, remove P2
            this.placedPlayers.set(player1Id, pos2);
            this.placedPlayers.delete(player2Id);
        }

        // Sync player objects
        const p1 = this.getPlayerById(player1Id);
        const p2 = this.getPlayerById(player2Id);

        if (p1) p1.gridPosition = this.placedPlayers.get(player1Id);
        if (p2) p2.gridPosition = this.placedPlayers.get(player2Id);

        this.eventBus.emit('playersSwapped', { player1Id, player2Id });
        return true;
    }

    confirmSetup(teamId: string): void {
        this.setupReady.add(teamId);

        if (
            this.setupReady.has(this.team1.id) &&
            this.setupReady.has(this.team2.id)
        ) {
            // Both ready, proceed to Kickoff
            this.startKickoff();
        } else {
            this.eventBus.emit('setupConfirmed', teamId);
        }
    }

    isSetupComplete(teamId: string): boolean {
        const placed = this.getPlacedCount(teamId);
        const team = teamId === this.team1.id ? this.team1 : this.team2;

        // Count only eligible players
        const eligiblePlayers = team.players.filter(
            (p) => p.status !== 'KO' && p.status !== 'Injured' && p.status !== 'Dead'
        );
        const available = Math.min(7, eligiblePlayers.length);

        return placed === available;
    }

    getSetupZone(teamId: string): import('../types/SetupTypes').SetupZone | undefined {
        if (teamId === this.team1.id) {
            return {
                minX: 0,
                maxX: 6,
                minY: 0,
                maxY: 10
            };
        } else if (teamId === this.team2.id) {
            return {
                minX: 13,
                maxX: 19,
                minY: 0,
                maxY: 10
            };
        }
        return undefined;
    }

    // ===== Kickoff Phase =====

    startKickoff(): void {
        this.state.phase = GamePhase.KICKOFF;
        this.eventBus.emit('kickoffStarted');
        this.eventBus.emit('phaseChanged', { phase: GamePhase.KICKOFF });
    }

    kickBall(playerId: string, targetX: number, targetY: number): void {
        if (this.state.phase !== GamePhase.KICKOFF) return;

        // Simplify for now: Assume valid kicker (validation can be in UI or here)
        // Roll Scatter and add it to the dice log
        const direction = Math.floor(Math.random() * 8) + 1; // 1-8
        this.eventBus.emit('diceRoll', {
            type: 'Scatter Direction',
            value: direction,
            result: direction
        });

        const distance = Math.floor(Math.random() * 6) + 1; // 1-6
        this.eventBus.emit('diceRoll', {
            type: 'Scatter Distance',
            value: distance,
            result: distance
        });

        // Calculate offset based on direction (Standard BB scatter template)
        // 1: TL, 2: T, 3: TR, 4: L, 5: R, 6: BL, 7: B, 8: BR
        let dx = 0;
        let dy = 0;

        switch (direction) {
            case 1: dx = -1; dy = -1; break;
            case 2: dx = 0; dy = -1; break;
            case 3: dx = 1; dy = -1; break;
            case 4: dx = -1; dy = 0; break;
            case 5: dx = 1; dy = 0; break;
            case 6: dx = -1; dy = 1; break;
            case 7: dx = 0; dy = 1; break;
            case 8: dx = 1; dy = 1; break;
        }

        const finalX = targetX + (dx * distance);
        const finalY = targetY + (dy * distance);

        this.eventBus.emit('ballKicked', {
            playerId,
            targetX,
            targetY,
            direction,
            distance,
            finalX,
            finalY
        });

        // Trigger event table
        setTimeout(() => this.rollKickoff(), 1000);
    }

    rollKickoff(): void {
        const d6 = () => Math.floor(Math.random() * 6) + 1;
        const roll = d6() + d6();
        let event = 'Changing Weather'; // Default 7

        // Blood Bowl 2020 (Season 2) / Standard Table
        switch (roll) {
            case 2: event = 'Get the Ref!'; break;
            case 3: event = 'Riot!'; break;
            case 4: event = 'Perfect Defense'; break;
            case 5: event = 'High Kick'; break;
            case 6: event = 'Cheering Fans'; break;
            case 7: event = 'Changing Weather'; break;
            case 8: event = 'Brilliant Coaching'; break;
            case 9: event = 'Quick Snap!'; break;
            case 10: event = 'Blitz!'; break;
            case 11: event = 'Throw a Rock'; break;
            case 12: event = 'Pitch Invasion!'; break;
        }

        this.eventBus.emit('kickoffResult', { roll, event });

        // Proceed to game after delay
        setTimeout(() => {
            this.eventBus.emit('readyToStart');
        }, 2000);
    }

    // ===== Game Phase =====

    startGame(kickingTeamId: string): void {
        this.state.phase = GamePhase.PLAY;

        // Ensure all players on pitch are ACTIVE
        const activatePlayers = (team: Team) => {
            team.players.forEach(p => {
                if (p.gridPosition) {
                    p.status = PlayerStatus.ACTIVE;
                } else if (!p.status) {
                    p.status = PlayerStatus.RESERVE;
                }
            });
        };

        activatePlayers(this.team1);
        activatePlayers(this.team2);

        const receivingTeamId =
            kickingTeamId === this.team1.id ? this.team2.id : this.team1.id;

        this.startTurn(receivingTeamId);
        this.eventBus.emit('phaseChanged', { phase: GamePhase.PLAY });
    }

    startTurn(teamId: string): void {
        this.state.phase = GamePhase.PLAY;
        this.state.activeTeamId = teamId;

        // Increment turn count for this team
        this.turnCounts[teamId] = (this.turnCounts[teamId] || 0) + 1;
        const currentTurn = this.turnCounts[teamId];

        this.state.turn = {
            teamId: teamId,
            turnNumber: currentTurn,
            isHalf2: this.state.turn.isHalf2,
            activatedPlayerIds: new Set(),
            hasBlitzed: false,
            hasPassed: false,
            hasHandedOff: false,
            hasFouled: false,
        };

        this.eventBus.emit('turnStarted', this.state.turn);
    }

    endTurn(): void {
        const currentTeamId = this.state.activeTeamId;
        if (!currentTeamId) return;

        const nextTeamId =
            currentTeamId === this.team1.id ? this.team2.id : this.team1.id;

        // Check if next team has turns left
        const nextTeamTurnCount = this.turnCounts[nextTeamId] || 0;

        if (nextTeamTurnCount >= this.maxTurns) {
            // If both teams finished max turns, end half
            const currentTeamTurnCount = this.turnCounts[currentTeamId];
            if (currentTeamTurnCount >= this.maxTurns) {
                this.endHalf();
                return;
            }
        }

        this.startTurn(nextTeamId);
    }

    endHalf(): void {
        this.state.phase = GamePhase.HALFTIME;
        this.eventBus.emit('phaseChanged', { phase: GamePhase.HALFTIME });
    }

    playerAction(playerId: string): boolean {
        if (this.state.phase !== GamePhase.PLAY) return false;
        if (this.state.turn.activatedPlayerIds.has(playerId)) return false;

        this.state.turn.activatedPlayerIds.add(playerId);
        this.eventBus.emit('playerActivated', playerId);
        return true;
    }

    hasPlayerActed(playerId: string): boolean {
        return this.state.turn.activatedPlayerIds.has(playerId);
    }

    // ===== Action Methods =====

    blockPlayer(attackerId: string, defenderId: string): { success: boolean; result?: string } {
        if (this.state.phase !== GamePhase.PLAY) return { success: false, result: 'Not in Play phase' };

        const attacker = this.getPlayerById(attackerId);
        const defender = this.getPlayerById(defenderId);

        if (!attacker || !defender) return { success: false, result: 'Player not found' };

        // Validate action
        const validation = this.actionValidator.validateAction('block', attacker, defender);
        if (!validation.valid) {
            return { success: false, result: validation.reason };
        }

        // TODO: Implement dice logic here using DiceService
        // For now, return success
        return { success: true, result: 'Block executed (Pseudo)' };
    }

    passBall(passerId: string, targetSquare: { x: number; y: number }): { success: boolean; result?: string } {
        if (this.state.phase !== GamePhase.PLAY) return { success: false, result: 'Not in Play phase' };

        const passer = this.getPlayerById(passerId);
        if (!passer) return { success: false, result: 'Player not found' };

        // Validate action
        const validation = this.actionValidator.validateAction('pass', passer, targetSquare);
        if (!validation.valid) {
            return { success: false, result: validation.reason };
        }

        return { success: true, result: 'Pass executed (Pseudo)' };
    }

    // ===== Score Management =====

    addTouchdown(teamId: string): void {
        this.state.score[teamId] = (this.state.score[teamId] || 0) + 1;
        this.eventBus.emit('touchdown', { teamId, score: this.state.score[teamId] });
    }

    getScore(teamId: string): number {
        return this.state.score[teamId] || 0;
    }

    // ===== Private Helper Methods =====

    private getPlacedCount(teamId: string): number {
        let count = 0;
        this.placedPlayers.forEach((_pos, pid) => {
            const p = this.getPlayerById(pid);
            if (p && p.teamId === teamId) count++;
        });
        return count;
    }

    private isValidSetupPosition(playerId: string, x: number, y: number): boolean {
        if (x < 0 || x >= 20 || y < 0 || y >= 11) return false;

        const player = this.getPlayerById(playerId);
        if (!player) return false;

        // Team 1: Left side (x: 0-5), Team 2: Right side (x: 14-19)
        if (player.teamId === this.team1.id) {
            return x >= 0 && x <= 5;
        } else {
            return x >= 14 && x < 20;
        }
    }

    private isSquareOccupiedByOther(x: number, y: number, playerId: string): boolean {
        for (const [pid, pos] of this.placedPlayers.entries()) {
            if (pid !== playerId && pos.x === x && pos.y === y) {
                return true;
            }
        }
        return false;
    }

    public getPlayerById(playerId: string): Player | undefined {
        return (
            this.team1.players.find((p) => p.id === playerId) ||
            this.team2.players.find((p) => p.id === playerId)
        );
    }

    // ===== Movement Implementation =====

    getAvailableMovements(playerId: string): { x: number; y: number }[] {
        const player = this.getPlayerById(playerId);
        if (!player || player.status !== PlayerStatus.ACTIVE) return [];

        // Identify opponents and teammates
        const myTeam = (player.teamId === this.team1.id) ? this.team1 : this.team2;
        const oppTeam = (player.teamId === this.team1.id) ? this.team2 : this.team1;

        // Filter active players for obstruction calculation
        const teammates = myTeam.players.filter(p => p.id !== playerId && p.status === PlayerStatus.ACTIVE && p.gridPosition);
        const opponents = oppTeam.players.filter(p => p.status === PlayerStatus.ACTIVE && p.gridPosition);

        return this.movementValidator.findReachableSquares(player, opponents, teammates);
    }

    async movePlayer(playerId: string, path: { x: number; y: number }[]): Promise<void> {
        const player = this.getPlayerById(playerId);
        if (!player) return;

        const oppTeam = (player.teamId === this.team1.id) ? this.team2 : this.team1;
        const opponents = oppTeam.players.filter(p => p.status === PlayerStatus.ACTIVE && p.gridPosition);

        // Validate path before moving
        // Note: The UI usually generates valid paths using pathfinding, but we verify here.
        const result = this.movementValidator.validatePath(player, [{ x: player.gridPosition!.x, y: player.gridPosition!.y }, ...path], opponents);

        if (!result.valid) {
            console.warn(`Invalid move attempted for player ${playerId}`);
            return;
        }

        // Execute move step-by-step
        // For now, simpler implementation: Move to end and consume MA/rolls events
        // In full implementation, we would await dice rolls for dodges/gfi.

        const finalSquare = path[path.length - 1];

        // Update player position
        player.gridPosition = finalSquare;

        // Mark as acted if it was a GFI or if rule dictates (usually move doesn't end activation unless block follows)
        // But for generic move action, it consumes activation in SEVENS/BB2020 if checks failed?
        // If move successful, player is still selected?
        // Usually 'Move Action' marks hasActed=true at end of turn/action?
        // We'll set position. The Turn Controller manages 'hasActed'.

        this.eventBus.emit('playerMoved', {
            playerId,
            from: result.path[0] || { x: player.gridPosition.x, y: player.gridPosition.y }, // Fallback if path empty (shouldn't happen) 
            to: finalSquare,
            path: path // Pass the full input path for animation
        });

        // Create roll events if any (mock for visuals)
        for (const roll of result.rolls) {
            // In real logic, we'd prompt user or roll dice.
            // If failed, handle turnover (not implemented in Phase 4).
            console.log(`Roll required: ${roll.type} target ${roll.target}`);
        }
    }

}
