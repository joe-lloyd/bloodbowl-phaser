import { ServiceContainer } from './ServiceContainer';
import { IEventBus } from './EventBus';
import { Scenario } from '@/types/Scenario';
import { Team } from '@/types/Team';
import { GameState } from '@/types/GameState';
import { PlayerStatus } from '@/types/Player';
import { SetupManager } from '../game/managers/SetupManager';

export class ScenarioLoader {
    constructor(
        private eventBus: IEventBus,
        private team1: Team,
        private team2: Team
    ) { }

    /**
     * Load a scenario by resetting the game service and initializing with new state
     */
    public load(scenario: Scenario): void {

        // 1. Prepare Teams (Deep Copy / Reset)
        // We need to mutate the passed teams to match scenario placement
        // But for cleaner state, we should probably clone them or assume they are passed fresh.
        // For now, we mutate the existing references as GameScene holds them.

        SetupManager.sanitizeTeam(this.team1);
        SetupManager.sanitizeTeam(this.team2);

        // Apply Placements
        scenario.setup.team1Placements.forEach(p => {
            const player = this.team1.players[p.playerIndex];
            if (player) {
                player.gridPosition = { x: p.x, y: p.y };
                player.status = p.status || PlayerStatus.ACTIVE;
            }
        });

        scenario.setup.team2Placements.forEach(p => {
            const player = this.team2.players[p.playerIndex];
            if (player) {
                player.gridPosition = { x: p.x, y: p.y };
                player.status = p.status || PlayerStatus.ACTIVE;
            }
        });

        // 2. Construct GameState
        // For Sandbox mode, we want to skip setup and go straight to Turn 1
        const initialState: GameState = {
            phase: scenario.setup.phase,
            subPhase: scenario.setup.subPhase,
            activeTeamId: scenario.setup.activeTeam === 'team1' ? this.team1.id : this.team2.id,
            turn: {
                teamId: scenario.setup.activeTeam === 'team1' ? this.team1.id : this.team2.id,
                turnNumber: 1, // Start at Turn 1 for immediate play
                isHalf2: false,
                activatedPlayerIds: new Set(),
                hasBlitzed: false,
                hasPassed: false,
                hasHandedOff: false,
                hasFouled: false,
                movementUsed: new Map(),
            },
            score: {
                [this.team1.id]: 0,
                [this.team2.id]: 0,
            },
            weather: 'Nice',
            ballPosition: scenario.setup.ballPosition ? { ...scenario.setup.ballPosition } : null
        };

        // 3. Re-Mount ServiceContainer
        ServiceContainer.reset();
        ServiceContainer.initialize(this.eventBus, this.team1, this.team2, initialState);

        // 4. Trigger UI Refresh and Turn Start
        this.eventBus.emit('gameStateRestored', initialState);

        // Emit phase change to update UI
        this.eventBus.emit('phaseChanged', {
            phase: initialState.phase,
            subPhase: initialState.subPhase,
            activeTeamId: initialState.activeTeamId
        });

        // Emit turn started to initialize turn state in UI
        this.eventBus.emit('turnStarted', {
            teamId: initialState.turn.teamId,
            turnNumber: initialState.turn.turnNumber,
            isHalf2: initialState.turn.isHalf2
        });

        this.eventBus.emit('refreshBoard');

        // Emit placements for UI
        this.emitPlacements(this.team1);
        this.emitPlacements(this.team2);

        if (initialState.ballPosition) {
            this.eventBus.emit('ballPlaced', initialState.ballPosition);
        }
    }

    private emitPlacements(team: Team): void {
        team.players.forEach(p => {
            if (p.gridPosition) {
                this.eventBus.emit('playerPlaced', {
                    playerId: p.id,
                    x: p.gridPosition.x,
                    y: p.gridPosition.y
                });
            }
        });
    }
}
