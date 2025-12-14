import { Scenario } from '../types/Scenario';
import { GamePhase, SubPhase } from '../types/GameState';
import { PlayerStatus } from '../types/Player';

export const SCENARIOS: Scenario[] = [
    {
        id: 'debug-empty',
        name: 'Empty Pitch',
        description: 'Clear pitch with no players placed',
        setup: {
            team1Placements: [],
            team2Placements: [],
            activeTeam: 'team1',
            phase: GamePhase.PLAY,
            subPhase: SubPhase.TURN_RECEIVING
        }
    },
    {
        id: 'basic-scrimmage',
        name: 'Basic Scrimmage',
        description: 'Standard 3-man line of scrimmage setup',
        setup: {
            team1Placements: [
                { playerIndex: 0, x: 9, y: 5, status: PlayerStatus.ACTIVE },
                { playerIndex: 1, x: 9, y: 4, status: PlayerStatus.ACTIVE },
                { playerIndex: 2, x: 9, y: 6, status: PlayerStatus.ACTIVE }
            ],
            team2Placements: [
                { playerIndex: 0, x: 10, y: 5, status: PlayerStatus.ACTIVE },
                { playerIndex: 1, x: 10, y: 4, status: PlayerStatus.ACTIVE },
                { playerIndex: 2, x: 10, y: 6, status: PlayerStatus.ACTIVE }
            ],
            activeTeam: 'team1',
            phase: GamePhase.PLAY,
            subPhase: SubPhase.TURN_RECEIVING,
            ballPosition: { x: 5, y: 5 }
        }
    },
    {
        id: 'movement-test',
        name: 'Movement Test',
        description: 'Test player movement ranges and obstacles',
        setup: {
            team1Placements: [
                { playerIndex: 0, x: 2, y: 5, status: PlayerStatus.ACTIVE } // Runner
            ],
            team2Placements: [
                { playerIndex: 0, x: 6, y: 4, status: PlayerStatus.ACTIVE }, // Obstacle
                { playerIndex: 1, x: 6, y: 5, status: PlayerStatus.ACTIVE }, // Obstacle
                { playerIndex: 2, x: 6, y: 6, status: PlayerStatus.ACTIVE }  // Obstacle
            ],
            activeTeam: 'team1',
            phase: GamePhase.PLAY,
            subPhase: SubPhase.TURN_RECEIVING
        }
    }
];
