import { describe, it, expect, beforeEach } from 'vitest';
import { MovementValidator } from '../../../src/domain/validators/MovementValidator';
import { PlayerBuilder } from '../../utils/test-builders';

describe('MovementValidator', () => {
    let validator: MovementValidator;
    const player = new PlayerBuilder().withId('p1').withStats(6, 3, 3, 8).build();

    beforeEach(() => {
        validator = new MovementValidator();
    });

    it('should validate simple valid move', () => {
        const result = validator.isValidMove(player, 5, 5, 6, 5, 1);
        expect(result).toBe(true);
    });

    it('should invalidate out of bounds move', () => {
        const result = validator.isValidMove(player, 0, 0, -1, 0, 1);
        expect(result).toBe(false);
    });

    it('should invalidate move beyond MA + 2', () => {
        // MA is 6. MA+2 = 8.
        const result = validator.isValidMove(player, 5, 5, 6, 5, 9); // currentMovement 9 > 8
        expect(result).toBe(false);
    });

    it('should invalidate non-adjacent move', () => {
        const result = validator.isValidMove(player, 5, 5, 7, 5, 1);
        expect(result).toBe(false);
    });

    it('should detect dodge roll requirement', () => {
        const rolls = validator.calculateRolls(player, 5, 5, 6, 5, 1); // 1 tackle zone
        expect(rolls).toContain('dodge');
    });

    it('should not require dodge if no tackle zones', () => {
        const rolls = validator.calculateRolls(player, 5, 5, 6, 5, 0);
        expect(rolls).not.toContain('dodge');
    });
});
