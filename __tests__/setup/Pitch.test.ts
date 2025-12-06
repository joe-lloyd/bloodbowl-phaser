
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Pitch } from '../../src/game/Pitch';
import { GameConfig } from '../../src/config/GameConfig';

// Mock Phaser
const mockGraphics = {
    lineStyle: vi.fn(),
    fillStyle: vi.fn(),
    lineBetween: vi.fn(),
    fillRect: vi.fn(),
    strokePath: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    setName: vi.fn(), // Add this since Pitch calls it
    clear: vi.fn(),   // Common
    destroy: vi.fn()
};

const mockScene = {
    add: {
        container: vi.fn(() => ({
            add: vi.fn(),
            getAll: vi.fn(() => [])
        })),
        graphics: vi.fn(() => mockGraphics),
        rectangle: vi.fn(() => ({
            setInteractive: vi.fn(),
            setStrokeStyle: vi.fn(),
            setName: vi.fn(),
            destroy: vi.fn()
        })),
        circle: vi.fn(() => ({
            setStrokeStyle: vi.fn(),
            setName: vi.fn()
        }))
    }
};

describe('Pitch', () => {
    let pitch: Pitch;

    beforeEach(() => {
        vi.clearAllMocks();
        pitch = new Pitch(mockScene as any, 0, 0);
    });

    it('should draw correct field markings (Center and Setup Lines)', () => {
        // Pitch Width = 20, Square Size = 60
        // Center Line (LoS) at Grid 10 (10 * 60 = 600)
        // Left Setup Line at Grid 7 (7 * 60 = 420)
        // Right Setup Line at Grid 13 (13 * 60 = 780)

        // Filter calls to lineBetween related to vertical formatting lines
        // lineBetween(x1, y1, x2, y2)
        // We expect vertical lines: y1=0, y2=Height*60 (11*60=660)

        const height = GameConfig.PITCH_HEIGHT * GameConfig.SQUARE_SIZE; // 660

        // Check for Center Line (600)
        expect(mockGraphics.lineBetween).toHaveBeenCalledWith(600, 0, 600, height);

        // Check for Left Setup Line (420)
        expect(mockGraphics.lineBetween).toHaveBeenCalledWith(420, 0, 420, height);

        // Check for Right Setup Line (780)
        expect(mockGraphics.lineBetween).toHaveBeenCalledWith(780, 0, 780, height);
    });

    it('should draw grid lines', () => {
        // Just verify basic grid drawing happened (many calls)
        expect(mockGraphics.lineBetween).toHaveBeenCalled();
    });
});
