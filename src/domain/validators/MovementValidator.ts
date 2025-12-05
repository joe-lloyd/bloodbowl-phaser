import { Player } from '@/types/Player';

export interface MovementResult {
    valid: boolean;
    rollsRequired: string[]; // 'dodge', 'gfi'
    targetPosition: { x: number, y: number };
}

export class MovementValidator {
    /**
     * Check if a move is valid regardless of rolls
     */
    isValidMove(
        player: Player,
        fromX: number,
        fromY: number,
        toX: number,
        toY: number,
        currentMovement: number
    ): boolean {
        // Basic grid bounds check
        if (toX < 0 || toX >= 26 || toY < 0 || toY >= 15) return false;

        // Distance check (adjacent only for now, unless implementing pathfinding later)
        const dx = Math.abs(toX - fromX);
        const dy = Math.abs(toY - fromY);
        if (dx > 1 || dy > 1) return false;

        // MA check
        // If movement > MA, it's a GFI
        if (currentMovement >= player.stats.MA + 2) { // MA + 2 GFIs allowed
            return false;
        }

        return true;
    }

    /**
     * Calculate required rolls for a move
     */
    calculateRolls(
        player: Player,
        fromX: number,
        fromY: number,
        toX: number,
        toY: number,
        tackleZones: number // zones at FROM square
    ): string[] {
        const rolls: string[] = [];

        // Dodge check: if leaving a tackle zone
        if (tackleZones > 0) {
            rolls.push('dodge');
        }

        // GFI check
        // This needs current movement context, keeping it simple for now

        return rolls;
    }
}
