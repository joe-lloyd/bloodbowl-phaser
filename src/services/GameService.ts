/**
 * GameService - Core game logic service
 * 
 * Pure TypeScript implementation with no Phaser dependencies.
 * Manages game state, phase transitions, and turn management.
 */

import { IGameService } from './interfaces/IGameService.js';
import { IEventBus } from './EventBus.js';
import { GameState, GamePhase, SubPhase } from '@/types/GameState';
import { Team } from '@/types/Team';
import { Player, PlayerStatus } from '@/types/Player';
import { MovementValidator } from '../game/validators/MovementValidator.js';
import { ActionValidator } from '../game/validators/ActionValidator.js';
import { ActivationValidator } from '../game/validators/ActivationValidator.js';
import { BlockValidator } from '../game/validators/BlockValidator.js';
import { Scenario } from '@/types/Scenario';


export class GameService implements IGameService {
    private state: GameState;
    private team1: Team;
    private team2: Team;
    private maxTurns: number = 6; // Sevens default
    private turnCounts: { [key: string]: number } = {};
    private placedPlayers: Map<string, { x: number; y: number }> = new Map();
    private setupReady: Set<string> = new Set();
    private driveKickingTeamId: string | null = null;

    // Validators
    private movementValidator: MovementValidator = new MovementValidator();
    private actionValidator: ActionValidator = new ActionValidator();
    private activationValidator: ActivationValidator = new ActivationValidator();
    private blockValidator: BlockValidator = new BlockValidator();

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
            subPhase: SubPhase.WEATHER, // Start with Weather
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
                movementUsed: new Map(),
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

    getSubPhase(): SubPhase | undefined {
        return this.state.subPhase;
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

        // If startingTeamId provided, jump to kicking setup
        if (startingTeamId) {
            this.state.subPhase = SubPhase.SETUP_KICKING;
            this.state.activeTeamId = startingTeamId;
            this.eventBus.emit('phaseChanged', { phase: GamePhase.SETUP, subPhase: this.state.subPhase });
        } else {
            // Otherwise start at beginning sequence
            this.state.subPhase = SubPhase.WEATHER;
            this.eventBus.emit('phaseChanged', { phase: GamePhase.SETUP, subPhase: SubPhase.WEATHER });

            // Perform Weather Roll
            this.rollWeather();

            // Proceed to Coin Flip after a short delay
            setTimeout(() => {
                this.state.subPhase = SubPhase.COIN_FLIP;
                this.eventBus.emit('phaseChanged', { phase: GamePhase.SETUP, subPhase: SubPhase.COIN_FLIP });
            }, 2000);
        }
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

        // Setup Logic Flow:
        // 1. Kicking Team confirms -> Switch to Receiving Team
        // 2. Receiving Team confirms -> Proceed to Kickoff

        // We need to know who is kicking/receiving.
        // If we trust `state.subPhase`

        if (this.state.subPhase === SubPhase.SETUP_KICKING) {
            if (teamId === this.state.activeTeamId) {
                // Kicking team done. Switch to Receiving.
                // Assuming activeTeamId is currently Kicking Team.
                const receivingTeamId = (teamId === this.team1.id) ? this.team2.id : this.team1.id;

                this.state.subPhase = SubPhase.SETUP_RECEIVING;
                this.state.activeTeamId = receivingTeamId;

                this.eventBus.emit('phaseChanged', {
                    phase: GamePhase.SETUP,
                    subPhase: SubPhase.SETUP_RECEIVING,
                    activeTeamId: receivingTeamId
                });
            }
        } else if (this.state.subPhase === SubPhase.SETUP_RECEIVING) {
            if (teamId === this.state.activeTeamId) {
                // Receiving team done. Proceed to Kickoff.
                this.startKickoff();
            }
        } else {
            // Fallback for old/undefined behavior or if simultaneous setup
            if (this.setupReady.has(this.team1.id) && this.setupReady.has(this.team2.id)) {
                this.startKickoff();
            } else {
                this.eventBus.emit('setupConfirmed', teamId);
            }
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
        this.state.subPhase = SubPhase.SETUP_KICKOFF;
        this.eventBus.emit('kickoffStarted');
        this.eventBus.emit('phaseChanged', { phase: GamePhase.KICKOFF, subPhase: SubPhase.SETUP_KICKOFF });
    }

    selectKicker(playerId: string): void {
        // Just emit selection, no phase change needed.
        // Logic for "Target Selection" is now just part of the same phase.
        if (this.state.phase === GamePhase.KICKOFF) {
            const player = this.getPlayerById(playerId);
            if (player) {
                this.eventBus.emit('playerSelected', { player });
            }
        }
    }

    kickBall(playerId: string, targetX: number, targetY: number): void {
        if (this.state.phase !== GamePhase.KICKOFF) return;

        // Transition to ROLL_KICK_OFF (Visually, ball is in air, but we determine result)
        this.state.subPhase = SubPhase.ROLL_KICKOFF;
        this.eventBus.emit('phaseChanged', { phase: GamePhase.KICKOFF, subPhase: SubPhase.ROLL_KICKOFF });

        // Simplify for now: Assume valid kicker (validation can be in UI or here)
        // Roll Scatter and add it to the dice log
        const direction = Math.floor(Math.random() * 8) + 1; // 1-8
        this.eventBus.emit('diceRoll', {
            rollType: 'Kickoff Scatter',
            diceType: 'd8',
            value: direction,
            total: direction,
            description: `Scatter Direction: ${direction}`,
            passed: true
        });

        const distance = Math.floor(Math.random() * 6) + 1; // 1-6
        this.eventBus.emit('diceRoll', {
            rollType: 'Kickoff Scatter',
            diceType: 'd6',
            value: distance,
            total: distance,
            description: `Scatter Distance: ${distance}`,
            passed: true
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
        this.state.subPhase = SubPhase.RESOLVE_KICKOFF;
        this.eventBus.emit('phaseChanged', { phase: GamePhase.KICKOFF, subPhase: SubPhase.RESOLVE_KICKOFF });

        const d6 = () => Math.floor(Math.random() * 6) + 1;
        const d1 = d6();
        const d2 = d6();
        const roll = d1 + d2;
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

        this.eventBus.emit('diceRoll', {
            rollType: 'Kickoff Event',
            diceType: '2d6',
            value: [d1, d2],
            total: roll,
            description: `Kickoff Result: ${event}`,
            passed: true
        });

        this.eventBus.emit('kickoffResult', { roll, event });

        // Proceed to Ball Placement phase after delay
        setTimeout(() => {
            this.state.subPhase = SubPhase.PLACE_BALL;
            this.eventBus.emit('phaseChanged', { phase: GamePhase.KICKOFF, subPhase: SubPhase.PLACE_BALL });
            this.resolveBallPlacement();
        }, 2000);
    }

    resolveBallPlacement(): void {
        // Here we would handle ball scatter results, bounce, pickup etc.
        // For now, assume ball lands and we start game.
        // Eventually this will be interactive or complex.

        setTimeout(() => {
            this.eventBus.emit('readyToStart');
        }, 1000);
    }

    // ===== Sub-Phase Helpers =====

    setWeather(weather: number): void {
        // TODO: Store weather
        this.state.subPhase = SubPhase.COIN_FLIP;
        this.eventBus.emit('phaseChanged', { phase: GamePhase.SETUP, subPhase: SubPhase.COIN_FLIP });
    }

    rollWeather(): void {
        const d6 = () => Math.floor(Math.random() * 6) + 1;
        const d1 = d6();
        const d2 = d6();
        const roll = d1 + d2;
        let weather = 'Nice';

        switch (roll) {
            case 2: weather = 'Sweltering Heat'; break;
            case 3: weather = 'Very Sunny'; break;
            case 4:
            case 5:
            case 6:
            case 7:
            case 8:
            case 9:
            case 10: weather = 'Nice'; break;
            case 11: weather = 'Pouring Rain'; break;
            case 12: weather = 'Blizzard'; break;
        }

        this.eventBus.emit('diceRoll', {
            rollType: 'Weather',
            diceType: '2d6',
            value: [d1, d2],
            total: roll,
            description: `Weather Result: ${weather}`,
            passed: true
        });
    }

    setCoinFlipWinner(winningTeamId: string): void {
        // Trigger Setup Kicking
        this.startSetup(winningTeamId);
    }

    // ===== Game Phase =====

    startGame(kickingTeamId: string): void {
        this.state.phase = GamePhase.PLAY;
        this.driveKickingTeamId = kickingTeamId;

        // Determine who goes first (Receiving team)
        const receivingTeamId = kickingTeamId === this.team1.id ? this.team2.id : this.team1.id;

        // SubPhase depends on who is active.
        this.state.subPhase = SubPhase.TURN_RECEIVING;
        this.state.activeTeamId = receivingTeamId;

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

        this.startTurn(receivingTeamId);
        this.eventBus.emit('phaseChanged', { phase: GamePhase.PLAY, subPhase: this.state.subPhase });
    }

    startTurn(teamId: string): void {
        this.state.phase = GamePhase.PLAY;
        this.state.activeTeamId = teamId;

        if (this.driveKickingTeamId) {
            this.state.subPhase = (teamId === this.driveKickingTeamId)
                ? SubPhase.TURN_KICKING
                : SubPhase.TURN_RECEIVING;
        }

        // Emit phase changed for sub-phase update
        this.eventBus.emit('phaseChanged', { phase: GamePhase.PLAY, subPhase: this.state.subPhase });

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
            movementUsed: new Map(),
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

    finishActivation(playerId: string): void {
        if (this.state.phase !== GamePhase.PLAY) return;

        // Mark as used
        if (!this.state.turn.activatedPlayerIds.has(playerId)) {
            this.state.turn.activatedPlayerIds.add(playerId);
            this.eventBus.emit('playerActivated', playerId); // UI updates visuals (greyscale)
        }

        // Check if any actions remain
        const activeTeam = (this.state.activeTeamId === this.team1.id) ? this.team1 : this.team2;
        const hasActions = this.activationValidator.hasAvailablePlayers(activeTeam, this.state.turn);

        console.log(`[GameService] Activation Finished for ${playerId}. Remaining Actions? ${hasActions}`);

        if (!hasActions) {
            console.log('[GameService] No actions remaining. Ending Turn.');
            setTimeout(() => this.endTurn(), 500);
        }
    }

    canActivate(playerId: string): boolean {
        const player = this.getPlayerById(playerId);
        if (!player) return false;
        return this.activationValidator.canActivate(player, this.state.turn);
    }



    // Legacy / simple wrapper
    playerAction(playerId: string): boolean {
        // This serves as "Start Action" now
        if (!this.canActivate(playerId)) return false;
        // We don't mark as activated HERE for movement start, 
        // because we might cancel? 
        // Actually, user said: "if a player finishes a block of its full sprint movement we can automatically finish the players activation."
        // So we mark it "Used" at the END of the action.

        // HOWEVER, we need to prevent selecting OTHERS while one is acting?
        // That's UI Controller logic.
        return true;
    }

    hasPlayerActed(playerId: string): boolean {
        return this.state.turn.activatedPlayerIds.has(playerId);
    }

    // ===== Action Methods =====

    previewBlock(attackerId: string, defenderId: string): void {
        const attacker = this.getPlayerById(attackerId);
        const defender = this.getPlayerById(defenderId);

        if (!attacker || !defender) {
            console.error("Player not found for block");
            return;
        }

        const allPlayers = [...this.team1.players, ...this.team2.players];
        const analysis = this.blockValidator.analyzeBlock(attacker, defender, allPlayers);

        this.eventBus.emit('ui:blockDialog', {
            attackerId,
            defenderId,
            analysis
        });
    }

    triggerTurnover(reason: string): void {
        console.log(`[GameService] TURNOVER! Reason: ${reason}`);

        // 1. Emit Visualization Event
        this.eventBus.emit('ui:turnover', { teamId: this.state.activeTeamId || '', reason });
        this.eventBus.emit('turnover', { teamId: this.state.activeTeamId || '' });

        // 2. Clear any pending states (e.g. movement paths) - Optional, UI should handle
        // 3. Wait for animation/display
        setTimeout(() => {
            this.endTurn();
        }, 3000); // 3 seconds to show BIG text
    }

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

        this.state.phase = GamePhase.TOUCHDOWN;
        this.state.subPhase = SubPhase.SCORING;

        this.eventBus.emit('touchdown', { teamId, score: this.state.score[teamId] });
        this.eventBus.emit('phaseChanged', { phase: GamePhase.TOUCHDOWN, subPhase: SubPhase.SCORING });

        // Auto-proceed to End Drive after delay? Or wait for UI?
        // Let's providing a method to proceed
        setTimeout(() => this.startEndDriveSequence(), 2000);
    }

    startEndDriveSequence(): void {
        // End of Drive
        // 1. Recover KO
        this.state.subPhase = SubPhase.RECOVER_KO;
        this.eventBus.emit('phaseChanged', { phase: GamePhase.TOUCHDOWN, subPhase: SubPhase.RECOVER_KO });

        // Auto-resolve KO for now (or placeholder)
        this.recoverKO();
    }

    recoverKO(): void {
        // TODO: Roll for each KO player
        // For now, just skip to Secret Weapons or Reset
        setTimeout(() => {
            this.state.subPhase = SubPhase.SECRET_WEAPONS;
            this.eventBus.emit('phaseChanged', { phase: GamePhase.TOUCHDOWN, subPhase: SubPhase.SECRET_WEAPONS });

            // Done with drive, new kick off
            setTimeout(() => {
                this.resetForKickoff();
            }, 1000);
        }, 1000);
    }

    resetForKickoff(): void {
        // Prepare for new drive
        // Swap kicking/receiving roles? Usually receiving team now kicks.
        // The team that SCORED kicks off next.
        // Assuming we know who scored from 'activeTeamId' or pass it.
        // Actually Touchdown event has it.

        // Let's assume the ACTIVE team scored (usually true).
        const scoringTeamId = this.state.activeTeamId;
        if (scoringTeamId) {
            this.startSetup(scoringTeamId); // Scorer kicks off
        } else {
            // Fallback
            this.startSetup(this.driveKickingTeamId || this.team1.id);
        }
    }

    getScore(teamId: string): number {
        return this.state.score[teamId] || 0;
    }

    // ===== Private Helper Methods =====

    // ===== Sandbox / Scenario Methods =====

    loadScenario(scenario: Scenario): void {
        this.resetInternalState();

        // Set Phase
        this.state.phase = scenario.setup.phase;
        this.state.subPhase = scenario.setup.subPhase;
        // Force active team
        this.state.activeTeamId = scenario.setup.activeTeam === 'team1' ? this.team1.id : this.team2.id;

        // Setup internal trackers for phases
        if (scenario.setup.activeTeam === 'team1') {
            this.state.turn.teamId = this.team1.id;
        } else {
            this.state.turn.teamId = this.team2.id;
        }

        this.eventBus.emit('phaseChanged', { phase: this.state.phase, subPhase: this.state.subPhase });

        // Reset all players to Reserve
        const resetTeam = (team: Team) => {
            team.players.forEach(p => {
                p.status = PlayerStatus.RESERVE;
                p.gridPosition = undefined;
                p.hasActed = false;
            });
            // Also clear internal placement map
            this.placedPlayers = new Map();
        };
        resetTeam(this.team1);
        resetTeam(this.team2);

        // Apply Placements
        scenario.setup.team1Placements.forEach(p => {
            const player = this.team1.players[p.playerIndex];
            if (player) {
                // Direct set, bypassing validation (Sandbox Mode)
                player.gridPosition = { x: p.x, y: p.y };
                player.status = p.status || PlayerStatus.ACTIVE;
                this.placedPlayers.set(player.id, { x: p.x, y: p.y });
                this.eventBus.emit('playerPlaced', { playerId: player.id, x: p.x, y: p.y });
            }
        });

        scenario.setup.team2Placements.forEach(p => {
            const player = this.team2.players[p.playerIndex];
            if (player) {
                player.gridPosition = { x: p.x, y: p.y };
                player.status = p.status || PlayerStatus.ACTIVE;
                this.placedPlayers.set(player.id, { x: p.x, y: p.y });
                this.eventBus.emit('playerPlaced', { playerId: player.id, x: p.x, y: p.y });
            }
        });

        // Ball Position
        if (scenario.setup.ballPosition) {
            this.eventBus.emit('ballPlaced', scenario.setup.ballPosition);
        }

        this.eventBus.emit('refreshBoard');
    }

    private resetInternalState(): void {
        this.turnCounts = {
            [this.team1.id]: 0,
            [this.team2.id]: 0,
        };
        this.state.score = {
            [this.team1.id]: 0,
            [this.team2.id]: 0,
        };
        this.placedPlayers.clear();
        this.setupReady.clear();
        this.driveKickingTeamId = null;
        // Reset turn data
        this.state.turn = {
            teamId: '',
            turnNumber: 0,
            isHalf2: false,
            activatedPlayerIds: new Set(),
            hasBlitzed: false,
            hasPassed: false,
            hasHandedOff: false,
            hasFouled: false,
            movementUsed: new Map(),
        };
    }

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

    getMovementUsed(playerId: string): number {
        return this.state.turn.movementUsed.get(playerId) || 0;
    }

    getAvailableMovements(playerId: string): { x: number; y: number; cost?: number }[] {
        const player = this.getPlayerById(playerId);
        // Only active team
        if (!player || player.teamId !== this.state.activeTeamId) return [];

        // Subtract already used movement
        const used = this.getMovementUsed(playerId);
        const ma = player.stats.MA;
        const remainingMA = Math.max(0, ma - used); // MA remaining
        // Total range = MA + 2 (Sprint) - Used
        // But the validator needs "Move Allowance" to calc costs?
        // Actually, the validator usually takes 'MA' and returns reachable.
        // We can pass a "modified MA" or just filter results?
        // Better: The validator calculates cost from START position.
        // We are moving from CURRENT position.
        // So we pass the full MA, but we cap the result based on (MA + 2 - used).

        // If we have 0 remaining allowance (sprinted out), return empty?
        if (used >= ma + 2) return [];

        // For correct GFI calc, we need to know how much we ALREADY moved.
        // But for pathfinding from CURRENT square, we treat it as a fresh move with REDUCED allowance.
        // Pass 'remainingMA' as the MA to the validator?
        // Validator logic:
        // Cost > MA = Sprint.
        // So if we pass remainingMA, any move > remainingMA will be flagged as GFI.
        // That is correct behavior!

        const team = (player.teamId === this.team1.id) ? this.team1 : this.team2;
        const opponentTeam = (player.teamId === this.team1.id) ? this.team2 : this.team1;

        const opponents = opponentTeam.players.filter((p: any) => p.gridPosition);
        const teammates = team.players.filter((p: any) => p.gridPosition && p.id !== player.id);

        // We use a temporary player object with modified stats for validation?
        // Or just let validator use 'MA' and we filter?
        // Validator signature: findReachableArea(player, opponents, teammates)
        // It reads player.stats.MA.

        // Let's create a proxy player
        const proxyPlayer = {
            ...player,
            stats: {
                ...player.stats,
                MA: remainingMA
            }
        };

        // Note: If used > MA, remainingMA is 0. 
        // We still have 2 Sprint squares (if not used).
        // If used = MA, we have 2 squares allowed.
        // If used = MA + 1, we have 1 square allowed.

        // Actually, validator likely treats MA as "Safe Move". 
        // If remainingMA is 0, EVERYTHING is a GFI.

        return this.movementValidator.findReachableSquares(proxyPlayer as Player, opponents, teammates);
    }


    async movePlayer(playerId: string, path: { x: number; y: number }[]): Promise<void> {
        const player = this.getPlayerById(playerId);
        if (!player) return Promise.reject('Player not found!');

        // Mark as activated IMMEDIATELY upon committing to move?
        // NO. User wants partial activations.
        // We track "Acting Player" state implicitly by them being selected and having taken an action?
        // Or we just update movementUsed.

        // Standard Blood Bowl: Once you start a Move Action, you are committed.
        // You cannot switch to another player until this one ends.
        // So we strictly don't need to "Mark Activated" yet, but we are "In Action".

        const oppTeam = (player.teamId === this.team1.id) ? this.team2 : this.team1;
        const opponents = oppTeam.players.filter(p => p.status === PlayerStatus.ACTIVE && p.gridPosition);

        // Validate path before moving (Safety check)
        const result = this.movementValidator.validatePath(player, [{ x: player.gridPosition!.x, y: player.gridPosition!.y }, ...path], opponents);

        if (!result.valid) {
            console.warn(`Invalid move attempted for player ${playerId}`);
            return Promise.reject('Invalid Move');
        }

        // Execute move step-by-step with Roll Logic
        let currentPos = player.gridPosition!;
        const completedPath: { x: number; y: number }[] = [];
        let failed = false;

        let stepsTaken = 0;

        // Handle Stand Up cost if Prone
        if (player.status === PlayerStatus.PRONE) {
            stepsTaken += (player.stats.MA < 3) ? player.stats.MA : 3;
            player.status = PlayerStatus.ACTIVE; // Stand up automatically
            this.eventBus.emit('playerStatusChanged', player);
        }

        // Calculate Steps + Previous Usage
        const preUsed = this.getMovementUsed(playerId);

        for (const step of path) {
            if (failed) break;

            stepsTaken++;
            const totalUsed = preUsed + stepsTaken;

            // Check for GFI
            if (totalUsed > player.stats.MA) {
                // Determine Roll Target (usually 2+)
                let target = 2;

                // Roll
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
                    // Trip!
                    currentPos = step;
                    player.gridPosition = currentPos;

                    console.log("GFI FAILED! Player trips.");
                    player.status = PlayerStatus.PRONE; // Simplified Knockdown
                    this.eventBus.emit('playerStatusChanged', player);

                    // Use Centralized Turnover with visual
                    this.triggerTurnover("Failed GFI");

                    completedPath.push(step);

                    // Stop processing movement
                    break;
                } else {
                    currentPos = step;
                    completedPath.push(step);
                }
            } else {
                currentPos = step;
                completedPath.push(step);
            }
        }

        // Update player position
        player.gridPosition = currentPos;
        this.state.turn.movementUsed.set(playerId, preUsed + stepsTaken);

        this.eventBus.emit('playerMoved', {
            playerId,
            from: result.path[0] || { x: player.gridPosition.x, y: player.gridPosition.y },
            to: currentPos,
            path: completedPath
        });

        // Auto-finish if exhausted (MA + 2)
        const finalUsed = preUsed + stepsTaken;
        if (finalUsed >= player.stats.MA + 2) {
            this.finishActivation(playerId);
        }

        // If Failed GFI, we already finished activation and maybe turnover.

        return Promise.resolve();
    }

    public getTeam(teamId: string): Team | undefined {
        if (this.team1.id === teamId) return this.team1;
        if (this.team2.id === teamId) return this.team2;
        return undefined;
    }
}
