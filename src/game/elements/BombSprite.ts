import Phaser from "phaser";

/**
 * BombSprite — a little cartoon bomb thrown by a Bombardier, drawn
 * programmatically in the same spirit as BallSprite (the football). A black
 * sphere with a glossy highlight, a short brown fuse, and a spark on top.
 */
export class BombSprite extends Phaser.GameObjects.Container {
  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y);

    const body = scene.add.graphics();
    // Bomb body — a black sphere with a subtle outline.
    body.fillStyle(0x1a1a1a, 1);
    body.lineStyle(1.5, 0x000000, 1);
    body.fillCircle(0, 2, 16);
    body.strokeCircle(0, 2, 16);
    // Glossy highlight, top-left.
    body.fillStyle(0x5a5a5a, 0.9);
    body.fillCircle(-5, -3, 4);

    // A short cap + fuse curving up from the top of the bomb.
    const fuse = scene.add.graphics();
    fuse.fillStyle(0x3a3a3a, 1);
    fuse.fillRect(-4, -16, 8, 6); // metal cap
    fuse.lineStyle(2.5, 0x8b5a2b, 1); // brown fuse
    fuse.beginPath();
    fuse.moveTo(0, -14);
    fuse.lineTo(4, -20);
    fuse.lineTo(0, -25);
    fuse.strokePath();

    // Spark at the fuse tip.
    const spark = scene.add.star(0, -26, 5, 2, 5, 0xffcc33);
    spark.setStrokeStyle(1, 0xff6600);

    this.add([body, fuse, spark]);
    this.setDepth(120);
    scene.add.existing(this);

    // Twinkle the spark so the lit fuse reads as "about to blow".
    scene.tweens.add({
      targets: spark,
      scaleX: 1.6,
      scaleY: 1.6,
      alpha: 0.7,
      duration: 180,
      yoyo: true,
      repeat: -1,
    });
  }
}
