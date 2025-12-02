/**
 * Game state types for Blood Bowl Sevens
 */

import { Team } from "./Team";
import { Player } from "./Player";

/**
 * Game phase
 */
export enum GamePhase {
  SETUP = "Setup", // Pre-game team setup
  KICKOFF = "Kickoff", // Kick-off phase
  PLAYING = "Playing", // Active play
  HALFTIME = "Halftime", // Between halves
  POSTGAME = "Postgame", // Game over
}

/**
 * Which half of the game
 */
export enum GameHalf {
  FIRST = 1,
  SECOND = 2,
}

/**
 * Ball position and state
 */
export interface BallState {
  position: { x: number; y: number } | null; // null if held by player
  carrier: Player | null; // Player holding ball
  isLoose: boolean; // Ball on ground?
}

/**
 * Turn state
 */
export interface TurnState {
  half: GameHalf;
  turn: number; // 1-6 for each half
  activeTeamId: string; // Which team is taking their turn
  hasBlitzed: boolean; // Has blitz action been used this turn?
  hasPassed: boolean; // Has pass action been used this turn?
  hasFouled: boolean; // Has foul action been used this turn?
  rerollsUsed: number; // Team re-rolls used this half
}

/**
 * Score state
 */
export interface ScoreState {
  team1Score: number;
  team2Score: number;
}

/**
 * Main game state
 */
export interface GameState {
  // Game info
  id: string;
  phase: GamePhase;

  // Teams
  team1: Team;
  team2: Team;

  // Turn tracking
  turn: TurnState;

  // Score
  score: ScoreState;

  // Ball
  ball: BallState;

  // Turnover flag
  turnoverOccurred: boolean;

  // Weather (future feature)
  weather?: string;

  // Action history (for undo/replay)
  actionHistory: GameAction[];
}

/**
 * Game action types (for history/replay)
 */
export enum GameActionType {
  MOVE = "Move",
  BLOCK = "Block",
  BLITZ = "Blitz",
  PASS = "Pass",
  HANDOFF = "Handoff",
  FOUL = "Foul",
  PICKUP = "Pickup",
  STANDUP = "StandUp",
  END_TURN = "EndTurn",
}

/**
 * Game action (for history)
 */
export interface GameAction {
  type: GameActionType;
  playerId: string;
  timestamp: number;
  data: any; // Action-specific data
}

/**
 * Create a new game
 */
export function createGame(team1: Team, team2: Team): GameState {
  return {
    id: `game-${Date.now()}`,
    phase: GamePhase.SETUP,
    team1,
    team2,
    turn: {
      half: GameHalf.FIRST,
      turn: 1,
      activeTeamId: team1.id,
      hasBlitzed: false,
      hasPassed: false,
      hasFouled: false,
      rerollsUsed: 0,
    },
    score: {
      team1Score: 0,
      team2Score: 0,
    },
    ball: {
      position: null,
      carrier: null,
      isLoose: false,
    },
    turnoverOccurred: false,
    actionHistory: [],
  };
}

/**
 * Get the active team
 */
export function getActiveTeam(game: GameState): Team {
  return game.turn.activeTeamId === game.team1.id ? game.team1 : game.team2;
}

/**
 * Get the defending team
 */
export function getDefendingTeam(game: GameState): Team {
  return game.turn.activeTeamId === game.team1.id ? game.team2 : game.team1;
}

/**
 * Check if game is over
 */
export function isGameOver(game: GameState): boolean {
  return game.turn.half === GameHalf.SECOND && game.turn.turn > 6;
}

/**
 * Get remaining team re-rolls
 */
export function getRemainingRerolls(game: GameState, teamId: string): number {
  const team = teamId === game.team1.id ? game.team1 : game.team2;
  return team.rerolls - game.turn.rerollsUsed;
}

/**
 * Switch active team (end of turn)
 */
export function switchActiveTeam(game: GameState): void {
  game.turn.activeTeamId =
    game.turn.activeTeamId === game.team1.id ? game.team2.id : game.team1.id;

  // Reset turn flags
  game.turn.hasBlitzed = false;
  game.turn.hasPassed = false;
  game.turn.hasFouled = false;
  game.turnoverOccurred = false;
}

/**
 * Advance to next turn
 */
export function advanceTurn(game: GameState): void {
  switchActiveTeam(game);

  // If both teams have played, increment turn counter
  if (game.turn.activeTeamId === game.team1.id) {
    game.turn.turn++;

    // Check for half-time
    if (game.turn.turn > 6 && game.turn.half === GameHalf.FIRST) {
      game.turn.half = GameHalf.SECOND;
      game.turn.turn = 1;
      game.turn.rerollsUsed = 0; // Reset re-rolls for second half
      game.phase = GamePhase.HALFTIME;
    }

    // Check for game over
    if (game.turn.turn > 6 && game.turn.half === GameHalf.SECOND) {
      game.phase = GamePhase.POSTGAME;
    }
  }
}

/**
 * Record a touchdown
 */
export function recordTouchdown(game: GameState, teamId: string): void {
  if (teamId === game.team1.id) {
    game.score.team1Score++;
  } else {
    game.score.team2Score++;
  }

  // Reset for next drive
  game.phase = GamePhase.KICKOFF;
}
