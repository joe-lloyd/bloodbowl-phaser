import { GamePhase, SubPhase } from './GameState';
import { PlayerStatus } from './Player';

export interface PlayerPlacement {
    playerIndex: number; // Index in the team.players array
    x: number; // Grid X
    y: number; // Grid Y
    status?: PlayerStatus; // Optional status override
}

export interface ScenarioSetup {
    team1Placements: PlayerPlacement[];
    team2Placements: PlayerPlacement[];
    ballPosition?: { x: number, y: number };
    activeTeam: 'team1' | 'team2';
    turn?: number;
    phase: GamePhase;
    subPhase: SubPhase;
}

export interface Scenario {
    id: string;
    name: string;
    description: string;
    setup: ScenarioSetup;
}
