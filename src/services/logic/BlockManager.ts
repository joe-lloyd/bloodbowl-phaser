import { IEventBus } from '../EventBus';
import { GameState } from '@/types/GameState';
import { Team } from '@/types/Team';
import { Player } from '@/types/Player';
import { BlockValidator } from '../../game/validators/BlockValidator';
import { ActionValidator } from '../../game/validators/ActionValidator';

export class BlockManager {
    private blockValidator: BlockValidator = new BlockValidator();
    private actionValidator: ActionValidator = new ActionValidator();

    constructor(
        private eventBus: IEventBus,
        private state: GameState,
        private team1: Team,
        private team2: Team,
        private callbacks: {
            onTurnover: (reason: string) => void
        }
    ) { }

    public previewBlock(attackerId: string, defenderId: string): void {
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

    public blockPlayer(attackerId: string, defenderId: string): { success: boolean; result?: string } {
        // Validation handled by ActionValidator
        const attacker = this.getPlayerById(attackerId);
        const defender = this.getPlayerById(defenderId);

        if (!attacker || !defender) return { success: false, result: 'Player not found' };

        const validation = this.actionValidator.validateAction('block', attacker, defender);
        if (!validation.valid) {
            return { success: false, result: validation.reason };
        }

        // Logic for Block is currently:
        // 1. UI Selects Block -> previewBlock -> Dialog Opens.
        // 2. User selects dice result in Dialog -> ui:blockResultSelected event.
        // 3. GameService (or Controller) listens to event and triggers resolve.

        // So 'blockPlayer' might be the "Execute specific result" or "Initiate Roll".
        // In the current GameService, `blockPlayer` was a stub returning "Pseudo".
        // The real mechanics happen via the EventBus flow currently.

        // We will keep this as the API for "Execute Block Action" from UI/AI?
        return { success: true, result: 'Block executed (Pseudo)' };
    }

    private getPlayerById(playerId: string): Player | undefined {
        return (
            this.team1.players.find((p) => p.id === playerId) ||
            this.team2.players.find((p) => p.id === playerId)
        );
    }
}
