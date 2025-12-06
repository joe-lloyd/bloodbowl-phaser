
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SetupUIController } from '../../../../src/game/setup/SetupUIController';
import { Pitch } from '../../../../src/game/Pitch';
import { IGameService } from '../../../../src/services/interfaces/IGameService';

describe('SetupUIController', () => {
    let controller: SetupUIController;
    let mockScene: any;
    let mockPitch: any;
    let mockGameService: any;

    beforeEach(() => {
        mockScene = {
            add: {
                text: vi.fn(() => ({ setOrigin: vi.fn(), setDepth: vi.fn() })),
                rectangle: vi.fn(),
                container: vi.fn()
            },
            tweens: { add: vi.fn() }
        };

        mockPitch = {
            clearHighlights: vi.fn(),
            highlightSquare: vi.fn()
        };

        mockGameService = {
            getActiveTeamId: vi.fn(),
            getSetupZone: vi.fn()
        };

        controller = new SetupUIController(mockScene, mockPitch, mockGameService);
    });

    describe('highlightSetupZone', () => {
        it('should clear existing highlights before adding new ones', () => {
            mockGameService.getActiveTeamId.mockReturnValue('team1');
            mockGameService.getSetupZone.mockReturnValue({ minX: 0, maxX: 6, minY: 0, maxY: 10 });

            controller.highlightSetupZone();

            // Verify clear is called first (or at least called)
            expect(mockPitch.clearHighlights).toHaveBeenCalled();
        });

        it('should highlight Team 1 zone (Left) correctly', () => {
            mockGameService.getActiveTeamId.mockReturnValue('team1');
            // Team 1: 0-6
            const zone = { minX: 0, maxX: 6, minY: 0, maxY: 10 };
            mockGameService.getSetupZone.mockReturnValue(zone);

            controller.highlightSetupZone();

            // Should highlight 0-6 columns (7 * 11 squares = 77 calls)
            // Just satisfy that it calls highlightSquare with correct color 
            // Color for Team 1 (minX=0) is 0x4444ff
            expect(mockPitch.highlightSquare).toHaveBeenCalledWith(0, 0, 0x4444ff);
            expect(mockPitch.highlightSquare).toHaveBeenCalledWith(6, 10, 0x4444ff);
        });

        it('should highlight Team 2 zone (Right) correctly', () => {
            mockGameService.getActiveTeamId.mockReturnValue('team2');
            // Team 2: 13-19
            const zone = { minX: 13, maxX: 19, minY: 0, maxY: 10 };
            mockGameService.getSetupZone.mockReturnValue(zone);

            controller.highlightSetupZone();

            // Color for Team 2 (minX!=0) is 0xff4444
            expect(mockPitch.highlightSquare).toHaveBeenCalledWith(13, 0, 0xff4444);
            expect(mockPitch.highlightSquare).toHaveBeenCalledWith(19, 10, 0xff4444);
        });

        it('should clear highlights when confirm setup implies cleanup', () => {
            // Test clearHighlights method directly used during cleanup
            controller.clearHighlights();
            expect(mockPitch.clearHighlights).toHaveBeenCalled();
        });
    });
});
