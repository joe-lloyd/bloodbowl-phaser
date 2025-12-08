/**
 * Event Types for the Game
 * 
 * Type-safe event definitions for communication between Phaser game logic
 * and React UI components via the EventBus.
 */

import { GamePhase, GameState } from './GameState';
import { Team } from './Team';
import { Player } from './Player';

/**
 * Game Events - Emitted by GameService/Phaser
 * React components subscribe to these to update UI
 */
export interface GameEvents {
    // Phase Management
    'phaseChanged': { phase: GamePhase };
    'setupConfirmed': string; // teamId
    'kickoffStarted': void;
    'readyToStart': void;

    // Turn Management
    'turnStarted': {
        teamId: string;
        turnNumber: number;
        isHalf2: boolean;
    };
    'turnEnded': { teamId: string };

    // Player Actions
    'playerPlaced': { playerId: string; x: number; y: number };
    'playerRemoved': string; // playerId
    'playersSwapped': { player1Id: string; player2Id: string };
    'playerMoved': {
        playerId: string;
        from: { x: number; y: number };
        to: { x: number; y: number };
        path: { x: number; y: number }[];
    };
    'playerActivated': string; // playerId
    'playerSelected': { playerId: string };

    // Scoring
    'touchdown': { teamId: string; score: number };

    // Ball & Kickoff
    'ballKicked': {
        playerId: string;
        targetX: number;
        targetY: number;
        direction: number;
        distance: number;
        finalX: number;
        finalY: number;
    };
    'kickoffResult': { roll: number; event: string };

    // Dice
    'diceRoll': {
        type: string;
        value: number;
        result: number;
    };
}

/**
 * UI Events - Emitted by React components
 * GameService/Phaser subscribes to these to handle user actions
 */
export interface UIEvents {
    // Team Builder
    'ui:playerHired': { position: string };
    'ui:playerFired': { playerId: string };
    'ui:teamSaved': { team: Team };
    'ui:teamNameChanged': { name: string };
    'ui:teamColorChanged': { primary: number; secondary: number };
    'ui:rerollPurchased': void;

    // Game Actions
    'ui:actionSelected': { action: ActionType; playerId: string };
    'ui:confirmAction': { actionId: string };
    'ui:cancelAction': void;
    'ui:endTurn': void;

    // Setup
    'ui:placePlayer': { playerId: string; x: number; y: number };
    'ui:removePlayer': { playerId: string };
    'ui:confirmSetup': void;

    // Navigation
    'ui:sceneChange': { scene: string; data?: any };

    // Game Start
    'ui:startGame': { team1: Team; team2: Team };
}

/**
 * State Update Events - For synchronizing state
 */
export interface StateEvents {
    'team:updated': { team: Team };
    'game:stateChanged': { state: GameState };
    'player:updated': { player: Player };
}

/**
 * All Events - Union of all event types
 */
export type AllEvents = GameEvents & UIEvents & StateEvents;

/**
 * Action types available in the game
 */
export type ActionType =
    | 'move'
    | 'block'
    | 'blitz'
    | 'pass'
    | 'handoff'
    | 'foul'
    | 'standUp';

/**
 * Helper type for event handlers
 */
export type EventHandler<K extends keyof AllEvents> = (
    data: AllEvents[K]
) => void;
