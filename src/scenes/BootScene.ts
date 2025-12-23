import Phaser from "phaser";

/**
 * Boot Scene - Initial loading and setup
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: "BootScene" });
  }

  preload(): void {
    // Create a simple loading bar
    const width = this.cameras.main.width;
    const height = this.cameras.main.height;

    const progressBar = this.add.graphics();
    const progressBox = this.add.graphics();
    progressBox.fillStyle(0x222222, 0.8);
    progressBox.fillRect(width / 2 - 160, height / 2 - 25, 320, 50);

    this.load.on("progress", (value: number) => {
      progressBar.clear();
      progressBar.fillStyle(0xffffff, 1);
      progressBar.fillRect(width / 2 - 150, height / 2 - 15, 300 * value, 30);
    });

    this.load.on("complete", () => {
      progressBar.destroy();
      progressBox.destroy();
    });

    // Future: Load assets here
    // this.load.image('ball', 'assets/sprites/ball.png');
  }

  create(): void {
    // Notify UI that Phaser is ready
    const eventBus = (window as any).eventBus;
    if (eventBus) {
      eventBus.emit("phaser:ready");
      console.log("Phaser BootScene: Assets loaded, waiting for UI command...");
    }

    // Optional: Add a subtle background animation or effect here while waiting
    // For now, just a static color or the last frame of the loading bar
  }
}
