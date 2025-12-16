import { IEventBus } from '../EventBus';
import { GameState } from '@/types/GameState';
import { Team } from '@/types/Team';
import { Player, PlayerStatus } from '@/types/Player';
import { BlockValidator } from '../../game/validators/BlockValidator';
import { ActionValidator } from '../../game/validators/ActionValidator';
import { BlockResolutionService, BlockResult, BlockRollData, PushData, ArmorResult } from '../BlockResolutionService';

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

    /**
     * Roll block dice and emit results
     */
    public rollBlockDice(attackerId: string, defenderId: string, numDice: number, isAttackerChoice: boolean): void {
        const results = BlockResolutionService.rollBlockDice(numDice);

        const rollData: BlockRollData = {
            attackerId,
            defenderId,
            numDice,
            isAttackerChoice,
            results
        };

        this.eventBus.emit('blockDiceRolled', rollData);
    }

    /**
     * Resolve block with selected result
     */
    public resolveBlock(attackerId: string, defenderId: string, result: BlockResult): void {
        const attacker = this.getPlayerById(attackerId);
        const defender = this.getPlayerById(defenderId);

        if (!attacker || !defender) {
            console.error("Player not found for block resolution");
            return;
        }

        switch (result.type) {
            case 'skull':
                this.handleSkull(attacker);
                break;
            case 'both-down':
                this.handleBothDown(attacker, defender);
                break;
            case 'push':
            case 'pow':
            case 'pow-dodge':
                // Emit event for push direction selection
                const pushData = this.createPushData(attacker, defender, result.type);
                this.eventBus.emit('ui:selectPushDirection', pushData);
                break;
        }
    }

    /**
     * Execute push with direction
     */
    public executePush(defenderId: string, direction: { x: number; y: number }, resultType: string, followUp: boolean): void {
        const defender = this.getPlayerById(defenderId);
        if (!defender) return;

        // Save old position
        const oldPosition = defender.gridPosition ? { ...defender.gridPosition } : null;

        // Move defender to new position
        defender.gridPosition = direction;

        // Emit playerMoved event with correct data
        // Path should only include the destination for a push
        const path = oldPosition ? [oldPosition, direction] : [direction];

        this.eventBus.emit('playerMoved', {
            playerId: defenderId,
            from: oldPosition || direction,
            to: direction,
            path: path.filter(p => p && p.x !== undefined && p.y !== undefined)
        });

        // Handle knockdown for POW results
        if (resultType === 'pow' || resultType === 'pow-dodge') {
            this.knockDownPlayer(defender);
            const armorResult = this.rollArmor(defender);
            this.eventBus.emit('armorRolled', armorResult);
        }

        // TODO: Handle follow-up if requested
    }

    /**
     * Handle skull result (attacker down)
     */
    private handleSkull(attacker: Player): void {
        this.knockDownPlayer(attacker);
        const armorResult = this.rollArmor(attacker);
        this.eventBus.emit('armorRolled', armorResult);
        this.callbacks.onTurnover('Attacker Down (Skull)');
    }

    /**
     * Handle both down result
     */
    private handleBothDown(attacker: Player, defender: Player): void {
        this.knockDownPlayer(attacker);
        this.knockDownPlayer(defender);

        const attackerArmor = this.rollArmor(attacker);
        const defenderArmor = this.rollArmor(defender);

        this.eventBus.emit('armorRolled', attackerArmor);
        this.eventBus.emit('armorRolled', defenderArmor);

        this.callbacks.onTurnover('Both Down');
    }

    /**
     * Knock down a player
     */
    private knockDownPlayer(player: Player): void {
        player.status = PlayerStatus.PRONE;
        this.eventBus.emit('playerKnockedDown', { playerId: player.id });
    }

    /**
     * Roll armor for a player
     */
    private rollArmor(player: Player): ArmorResult {
        return BlockResolutionService.rollArmor(player);
    }

    /**
     * Create push data for UI selection
     */
    private createPushData(attacker: Player, defender: Player, resultType: string): PushData {
        const validDirections = BlockResolutionService.getValidPushDirections(
            attacker.gridPosition!,
            defender.gridPosition!
        );

        return {
            defenderId: defender.id,
            validDirections,
            canFollowUp: BlockResolutionService.allowsFollowUp(resultType as any),
            willFollowUp: false
        };
    }

    private getPlayerById(playerId: string): Player | undefined {
        return (
            this.team1.players.find((p) => p.id === playerId) ||
            this.team2.players.find((p) => p.id === playerId)
        );
    }
}
