import { IEventBus } from '../../services/EventBus';
import { GameState, GamePhase, SubPhase, TurnData } from '@/types/GameState';
import { Team } from '@/types/Team';
import { PlayerStatus } from '@/types/Player';
import { ActivationValidator } from '../validators/ActivationValidator';

export class TurnManager {
    private maxTurns: number = 6; // Sevens default
    private turnCounts: { [key: string]: number } = {};
    private driveKickingTeamId: string | null = null;
    private activationValidator: ActivationValidator = new ActivationValidator();

    constructor(
        private eventBus: IEventBus,
        private state: GameState,
        private team1: Team,
        private team2: Team,
        private callbacks: {
            onPhaseChanged: (phase: GamePhase, subPhase?: SubPhase) => void
        }
    ) {
        this.turnCounts[team1.id] = 0;
        this.turnCounts[team2.id] = 0;
    }

    public startGame(kickingTeamId: string): void {
        this.state.phase = GamePhase.PLAY;
        this.driveKickingTeamId = kickingTeamId;

        // Determine who goes first (Receiving team)
        const receivingTeamId = kickingTeamId === this.team1.id ? this.team2.id : this.team1.id;

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
        this.callbacks.onPhaseChanged(GamePhase.PLAY, this.state.subPhase);
    }

    public startTurn(teamId: string): void {
        this.state.phase = GamePhase.PLAY;
        this.state.activeTeamId = teamId;

        if (this.driveKickingTeamId) {
            this.state.subPhase = (teamId === this.driveKickingTeamId)
                ? SubPhase.TURN_KICKING
                : SubPhase.TURN_RECEIVING;
        }

        // Emit phase changed for sub-phase update
        this.callbacks.onPhaseChanged(GamePhase.PLAY, this.state.subPhase);

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

        this.eventBus.emit('turnStarted', this.state.turn as TurnData);
    }

    public endTurn(): void {
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

    public endHalf(): void {
        this.state.phase = GamePhase.HALFTIME;
        this.callbacks.onPhaseChanged(GamePhase.HALFTIME);
    }

    public finishActivation(playerId: string): void {
        if (this.state.phase !== GamePhase.PLAY) return;

        // Mark as used
        if (!this.state.turn.activatedPlayerIds.has(playerId)) {
            this.state.turn.activatedPlayerIds.add(playerId);
            this.eventBus.emit('playerActivated', playerId); // UI updates visuals
        }

        // Check if any actions remain
        const activeTeam = (this.state.activeTeamId === this.team1.id) ? this.team1 : this.team2;
        const hasActions = this.activationValidator.hasAvailablePlayers(activeTeam, this.state.turn);

        console.log(`[TurnManager] Activation Finished for ${playerId}. Remaining: ${hasActions}`);

        if (!hasActions) {
            console.log('[TurnManager] No actions remaining. Ending Turn.');
            setTimeout(() => this.endTurn(), 500);
        }
    }

    public checkTurnover(reason: string): void {
        console.log(`[TurnManager] TURNOVER! Reason: ${reason}`);

        // 1. Emit Visualization Event
        this.eventBus.emit('ui:turnover', { teamId: this.state.activeTeamId || '', reason });
        this.eventBus.emit('turnover', { teamId: this.state.activeTeamId || '' });

        // 2. Wait for animation/display
        setTimeout(() => {
            this.endTurn();
        }, 3000);
    }

    // Helpers
    public getTurnNumber(teamId: string): number {
        return this.turnCounts[teamId] || 0;
    }

    public reset(): void {
        this.turnCounts = {
            [this.team1.id]: 0,
            [this.team2.id]: 0,
        };
        this.driveKickingTeamId = null;
    }

    public getDriveKickingTeamId(): string | null {
        return this.driveKickingTeamId;
    }

    public setDriveKickingTeam(teamId: string): void {
        this.driveKickingTeamId = teamId;
    }
}
