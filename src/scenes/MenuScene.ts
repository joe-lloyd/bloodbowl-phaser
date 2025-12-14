import Phaser from "phaser";
import { EventBus } from "../services/EventBus";

/**
 * Menu Scene - Main menu with improved navigation
 * UI now handled by React overlay
 */
export class MenuScene extends Phaser.Scene {
  private eventBus!: EventBus;

  constructor() {
    super({ key: "MenuScene" });
  }

  create(): void {
    const width = this.cameras.main.width;
    const height = this.cameras.main.height;

    // Get EventBus from window (set in main.ts)
    this.eventBus = (window as any).eventBus;

    // Background
    this.add.rectangle(0, 0, width, height, 0x1a1a2e).setOrigin(0);

    // Listen for scene change events from React UI
    this.eventBus.on('ui:sceneChange', (data: { scene: string; data?: any }) => {
      this.scene.start(data.scene, data.data || {});
    });

  }

  destroy(): void {
    // Clean up event listeners
    if (this.eventBus) {
      this.eventBus.off('ui:sceneChange', () => { });
    }
  }
}
