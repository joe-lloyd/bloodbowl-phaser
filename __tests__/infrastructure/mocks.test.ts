import { describe, it, expect } from 'vitest';
import { MockScene, MockSprite, MockContainer } from '../mocks/phaser-mocks';

describe('Phaser Mocks Smoke Test', () => {
    it('should create a mock scene with correct properties', () => {
        const scene = new MockScene();
        expect(scene.sys.game.config.width).toBe(800);
        expect(scene.events).toBeDefined();
        expect(scene.input).toBeDefined();
        expect(scene.add).toBeDefined();
    });

    it('should create mock game objects via factory', () => {
        const scene = new MockScene();
        const sprite = scene.add.sprite(100, 200, 'test-texture');

        expect(sprite).toBeInstanceOf(MockSprite);
        expect(sprite.x).toBe(100);
        expect(sprite.y).toBe(200);
        expect(sprite.texture.key).toBe('test-texture');
    });

    it('should handle container children', () => {
        const scene = new MockScene();
        const container = new MockContainer(scene, 0, 0);
        const sprite = new MockSprite(scene, 0, 0, 'tex');

        container.add(sprite);
        expect(container.list).toHaveLength(1);
        expect(container.getAll()).toContain(sprite);

        container.removeAll();
        expect(container.list).toHaveLength(0);
    });

    it('should mock input events', () => {
        const scene = new MockScene();
        const sprite = new MockSprite(scene, 0, 0, 'tex');

        sprite.setInteractive();
        expect(sprite.setInteractive).toHaveBeenCalled();

        sprite.on('pointerdown', () => { });
        expect(sprite.on).toHaveBeenCalledWith('pointerdown', expect.any(Function));
    });
});
