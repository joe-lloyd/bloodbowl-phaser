import Phaser from "phaser";

/**
 * BallSprite - Visual representation of the ball
 */
export class BallSprite extends Phaser.GameObjects.Container {
    constructor(scene: Phaser.Scene, x: number, y: number) {
        super(scene, x, y);

        // Brown Ellipse (Ball) - Doubled size
        const ball = scene.add.ellipse(0, 0, 48, 32, 0x8b4513); // Saddle Brown
        ball.setStrokeStyle(1.5, 0x000000);

        // White Laces - Doubled size
        const laces = scene.add.graphics();
        laces.lineStyle(2, 0xffffff);
        laces.lineBetween(-14, 0, 14, 0); // Main lace
        laces.lineStyle(2, 0xffffff);
        laces.lineBetween(-8, -6, -8, 6);
        laces.lineBetween(0, -6, 0, 6);
        laces.lineBetween(8, -6, 8, 6);

        this.add([ball, laces]);
        this.setDepth(100);

        scene.add.existing(this);
    }
}
