import { Player, PlayerStatus } from '../../types/Player';
import { TurnState } from '../../types/GameState';
import { Team } from '../../types/Team';

export class ActivationValidator {
    /**
     * Check if a player can be activated (moved/acted with) in this turn.
     */
    public canActivate(player: Player, turnState: TurnState): boolean {
        // Must be active status (on pitch, standing/prone)
        // Note: Prone players need to stand up (costing movement), but can still 'activate'.
        // Stunned players CANNOT activate.
        if (player.status !== PlayerStatus.ACTIVE && player.status !== PlayerStatus.PRONE) {
            return false;
        }

        // Must belong to the active team
        if (player.teamId !== turnState.teamId) {
            return false;
        }

        // Must NOT have already been activated
        if (turnState.activatedPlayerIds.has(player.id)) {
            return false;
        }

        return true;
    }

    /**
     * Check if there are ANY players available to activate for the current team.
     * Used to determine if the turn should auto-end.
     */
    public hasAvailablePlayers(team: Team, turnState: TurnState): boolean {
        // If it's not this team's turn, they have 0 available.
        if (team.id !== turnState.teamId) return false;

        return team.players.some(player => {
            // Check basic eligibility: On pitch? (Grid position exists)
            // And Status (Active/Prone)
            // And NOT activated yet
            const onPitch = !!player.gridPosition;
            const canAct = player.status === PlayerStatus.ACTIVE || player.status === PlayerStatus.PRONE;
            const notUsed = !turnState.activatedPlayerIds.has(player.id);

            return onPitch && canAct && notUsed;
        });
    }
}
