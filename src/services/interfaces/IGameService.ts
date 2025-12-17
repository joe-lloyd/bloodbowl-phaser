/**
 * IGameService - Interface for core game logic
 * 
 * This service manages game state, phase transitions, and turn management.
 * It's pure TypeScript with no Phaser dependencies, making it fully testable.
 */

import { IEventBus } from '../EventBus.js';
import { GameState, GamePhase, SubPhase } from '@/types/GameState';
import { Team } from '@/types/Team';
import { Player } from '@/types/Player';

export interface IGameService {
    // ===== State Queries =====

    /**
     * Get the current game state
     */
    getState(): GameState;

    /**
     * Get the current game phase
     */
    getPhase(): GamePhase;

    /**
     * Get the current sub-phase
     */
    getSubPhase(): SubPhase | undefined;

    /**
     * Get the ID of the currently active team
     */
    getActiveTeamId(): string | null;

    /**
     * Get the current turn number for a team
     */
    getTurnNumber(teamId: string): number;

    /**
     * Get a team by ID
     */
    getTeam(teamId: string): Team | undefined;

    /**
     * Get a player by ID
     */
    getPlayerById(playerId: string): Player | undefined;

    // ===== Setup Phase =====

    /**
     * Start the setup phase
     */
    startSetup(startingTeamId?: string): void;

    /**
     * Place a player on the pitch during setup
     * @returns true if placement was successful
     */
    placePlayer(playerId: string, x: number, y: number): boolean;

    /**
     * Remove a player from the pitch during setup
     */
    removePlayer(playerId: string): void;

    /**
     * Swap two players' positions during setup
     * @returns true if swap was successful
     */
    swapPlayers(player1Id: string, player2Id: string): boolean;

    /**
     * Confirm setup for a team
     */
    confirmSetup(teamId: string): void;

    /**
     * Check if setup is complete for a team
     */
    isSetupComplete(teamId: string): boolean;

    /**
     * Get the setup zone boundaries for a team
     */
    getSetupZone(teamId: string): import('../../types/SetupTypes').SetupZone | undefined;

    // ===== Kickoff Phase =====

    /**
     * Start the kickoff phase
     */
    startKickoff(): void;

    /**
     * Select a player to be the kicker
     */
    selectKicker(playerId: string): void;

    /**
     * Roll for kickoff event
     */
    rollKickoff(): void;

    /**
     * Perform the kickoff action (kick ball + scatter + event)
     */
    kickBall(playerId: string, targetX: number, targetY: number): void;



    // ===== Game Phase =====

    /**
     * Start the game with the specified kicking team
     */
    startGame(kickingTeamId: string): void;

    /**
     * Start a turn for the specified team
     */
    startTurn(teamId: string): void;

    /**
     * End the current turn
     */
    endTurn(): void;

    /**
     * End the current half
     */
    endHalf(): void;

    /**
     * Record that a player has taken an action
     * @returns true if action was recorded successfully
     */
    playerAction(playerId: string): boolean;

    /**
     * Trigger a turnover
     * Ends the turn after a delay
     */
    triggerTurnover(reason: string): void;

    /**
     * Check if a player has acted this turn
     */
    hasPlayerActed(playerId: string): boolean;

    /**
     * Get the movement used by a player this turn
     */
    getMovementUsed(playerId: string): number;

    /**
     * Mark a player's activation as finished
     */
    finishActivation(playerId: string): void;

    /**
     * Check if a player can be activated/selected for action
     */
    canActivate(playerId: string): boolean;

    // ===== Action Methods =====

    /**
     * Preview a block action (emits UI event)
     */
    previewBlock(attackerId: string, defenderId: string): void;

    /**
     * Attempt to block an opponent
     */
    blockPlayer(attackerId: string, defenderId: string): { success: boolean; result?: string };

    /**
     * Attempt to pass the ball
     */
    passBall(passerId: string, targetSquare: { x: number; y: number }): { success: boolean; result?: string };

    // ===== Score Management =====

    /**
     * Add a touchdown for a team
     */
    addTouchdown(teamId: string): void;

    /**
     * Get the score for a team
     */
    getScore(teamId: string): number;

    // ===== Movement =====

    /**
     * Get all reachable squares for a player
     */
    getAvailableMovements(playerId: string): { x: number; y: number; cost?: number }[];

    /**
     * Move a player along a path
     */
    movePlayer(playerId: string, path: { x: number; y: number }[]): Promise<void>;

    // ===== Block Actions =====

    /**
     * Preview a block action
     */
    previewBlock(attackerId: string, defenderId: string): void;

    /**
     * Roll block dice
     */
    rollBlockDice(attackerId: string, defenderId: string, numDice: number, isAttackerChoice: boolean): void;

    /**
     * Resolve a block with the selected result
     */
    resolveBlock(attackerId: string, defenderId: string, result: any): void;

    /**
     * Execute a push in a specific direction
     */
    executePush(attackerId: string, defenderId: string, direction: { x: number; y: number }, resultType: string, followUp: boolean): void;

}
