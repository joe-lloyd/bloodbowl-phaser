import { describe, it, expect, beforeEach } from 'vitest';
import { MovementValidator } from '../../../src/domain/validators/MovementValidator';
import { PlayerBuilder } from '../../utils/test-builders';
import { Player, PlayerStatus } from '../../../src/types/Player';

describe('MovementValidator', () => {
    let validator: MovementValidator;
    let player: Player;
    let opponents: Player[];
    let teammates: Player[];

    beforeEach(() => {
        validator = new MovementValidator();
        // Create a standard human lineman (MA 6, AG 3) at 5,5
        player = new PlayerBuilder()
            .withId('p1')
            .withStats({ MA: 6, ST: 3, AG: 3, AV: 9, PA: 4 })
            .withGridPosition(5, 5)
            .withStatus(PlayerStatus.ACTIVE)
            .build();
        opponents = [];
        teammates = [];
    });

    describe('Basic Movement', () => {
        it('should validate a simple valid move within range', () => {
            // Move 3 squares to the right: 5,5 -> 8,5
            const result = validator.findPath(player, 8, 5, opponents, teammates);

            expect(result.valid).toBe(true);
            expect(result.path.length).toBe(3);
            expect(result.rolls).toHaveLength(0);

            // Check destination
            expect(result.path[result.path.length - 1]).toEqual({ x: 8, y: 5 });
        });

        it('should invalidate move out of bounds', () => {
            const result = validator.findPath(player, -1, 5, opponents, teammates);
            expect(result.valid).toBe(false);
        });

        it('should invalidate move to occupied square (standing player)', () => {
            const opponent = new PlayerBuilder()
                .withId('opp1')
                .withStatus(PlayerStatus.ACTIVE)
                .withGridPosition(6, 5)
                .build();
            opponents.push(opponent);

            const result = validator.findPath(player, 6, 5, opponents, teammates);
            expect(result.valid).toBe(false);
        });
    });

    describe('Tackle Zones & Dodging', () => {
        it('should detect dodge requirement when leaving a tackle zone', () => {
            // Opponent at 5,6 (below player at 5,5) exerts TZ on player
            const opponent = new PlayerBuilder()
                .withId('opp1')
                .withStatus(PlayerStatus.ACTIVE)
                .withGridPosition(5, 6)
                .build();
            opponents.push(opponent);

            // Move away to 5,4. Leaving TZ of opp1.
            const result = validator.findPath(player, 5, 4, opponents, teammates);

            expect(result.valid).toBe(true);
            expect(result.rolls).toHaveLength(1);
            expect(result.rolls[0].type).toBe('dodge');
            expect(result.rolls[0].target).toBe(3);
            expect(result.rolls[0].modifiers).toBe(1);
            expect(result.rolls[0].square).toEqual({ x: 5, y: 4 });
        });

        it('should calculate dodge modifiers correctly (dodging into a TZ)', () => {
            // Opponent 1 at 5,6 (start TZ)
            const opp1 = new PlayerBuilder()
                .withId('o1')
                .withStatus(PlayerStatus.ACTIVE)
                .withGridPosition(5, 6)
                .build();
            // Opponent 2 adjacent to destination. Destination 6,5.
            const opp2 = new PlayerBuilder()
                .withId('o2')
                .withStatus(PlayerStatus.ACTIVE)
                .withGridPosition(6, 6)
                .build();

            opponents = [opp1, opp2];

            // Move 5,5 -> 6,5
            const result = validator.findPath(player, 6, 5, opponents, teammates);

            expect(result.rolls).toHaveLength(1);
            expect(result.rolls[0].type).toBe('dodge');
            expect(result.rolls[0].modifiers).toBe(-1);
        });
    });

    describe('Pathfinding (A*)', () => {
        it('should path around an obstacle', () => {
            // Obstacle at 6,5 (directly Right)
            const obstacle = new PlayerBuilder()
                .withId('obs')
                .withStatus(PlayerStatus.ACTIVE)
                .withGridPosition(6, 5)
                .build();
            opponents.push(obstacle);

            // Target 7,5 (Right of obstacle)
            const result = validator.findPath(player, 7, 5, opponents, teammates);

            expect(result.valid).toBe(true);
            expect(result.path.length).toBeGreaterThan(0);

            // Should not pass through 6,5
            const passedThroughObstacle = result.path.some(p => p.x === 6 && p.y === 5);
            expect(passedThroughObstacle).toBe(false);

            // Destination check
            expect(result.path[result.path.length - 1]).toEqual({ x: 7, y: 5 });
        });

        it('should fail if destination is unreachable (blocked)', () => {
            const coords = [
                { x: 4, y: 4 }, { x: 5, y: 4 }, { x: 6, y: 4 },
                { x: 4, y: 5 }, { x: 6, y: 5 },
                { x: 4, y: 6 }, { x: 5, y: 6 }, { x: 6, y: 6 }
            ];
            opponents = coords.map((c, i) =>
                new PlayerBuilder()
                    .withId(`o${i}`)
                    .withStatus(PlayerStatus.ACTIVE)
                    .withGridPosition(c.x, c.y)
                    .build()
            );

            const result = validator.findPath(player, 8, 5, opponents, teammates);
            expect(result.valid).toBe(false);
        });
    });

    describe('GFI (Go For It)', () => {
        it('should generate rush rolls when exceeding MA', () => {
            const result = validator.findPath(player, 12, 5, opponents, teammates);

            expect(result.valid).toBe(true);
            expect(result.rolls).toHaveLength(1);
            expect(result.rolls[0].type).toBe('rush');
            expect(result.rolls[0].target).toBe(2);
        });

        it('should invalidate move beyond MA + 2', () => {
            const result = validator.findPath(player, 14, 5, opponents, teammates);
            expect(result.valid).toBe(false);
        });
    });

    describe('Reachable Squares', () => {
        it('should return all reachable squares within MA + 2', () => {
            // Player at 5,5. MA 6. Max 8.
            const squares = validator.findReachableSquares(player, opponents, teammates);

            expect(squares.length).toBeGreaterThan(0);

            // Should include 6,5 (1 step)
            expect(squares).toContainEqual({ x: 6, y: 5 });

            // Should NO LONGER include 5,5 (start)
            expect(squares).not.toContainEqual({ x: 5, y: 5 });

            // Should include max range: 5+8 = 13,5
            expect(squares).toContainEqual({ x: 13, y: 5 });

            // Should NOT include out of range: 14,5
            expect(squares).not.toContainEqual({ x: 14, y: 5 });
        });

        it('should calculate reachable squares blocked by opponents', () => {
            // Block path to right (6,5)
            const opponent = new PlayerBuilder()
                .withId('opp1')
                .withStatus(PlayerStatus.ACTIVE)
                .withGridPosition(6, 5)
                .build();
            opponents.push(opponent);

            const squares = validator.findReachableSquares(player, opponents, teammates);

            // 6,5 is occupied, so not reachable
            expect(squares).not.toContainEqual({ x: 6, y: 5 });

            // 7,5 is reachable by going around
            expect(squares).toContainEqual({ x: 7, y: 5 });
        });
    });
});
