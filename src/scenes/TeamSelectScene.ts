import Phaser from "phaser";
import { Team } from "../types/Team";
import { ServiceContainer } from "../services/ServiceContainer";
import { EventBus } from "../services/EventBus";

/**
 * Team Selection Scene
 * UI now handled by React overlay
 */
export class TeamSelectionScene extends Phaser.Scene {
  private eventBus!: EventBus;

  constructor() {
    super({ key: "TeamSelectionScene" });
  }

  create(): void {
    const width = this.cameras.main.width;
    const height = this.cameras.main.height;

    // Get EventBus from window
    this.eventBus = (window as any).eventBus;

    // Background
    this.add.rectangle(0, 0, width, height, 0x1a1a2e).setOrigin(0);

    // Listen for scene change events from React UI
    this.eventBus.on('ui:sceneChange', (data: { scene: string; data?: any }) => {
      this.scene.start(data.scene, data.data);
    });

    // Listen for start game event from React UI
    this.eventBus.on('ui:startGame', (data: { team1: Team; team2: Team }) => {
      // CRITICAL: Stop any running game scenes to prevent state leaks
      // This ensures SandboxScene or previous GameScene instances are fully cleaned up
      if (this.scene.isActive('SandboxScene')) {
        this.scene.stop('SandboxScene');
      }
      if (this.scene.isActive('GameScene')) {
        this.scene.stop('GameScene');
      }

      // Reset ServiceContainer to ensure clean state
      ServiceContainer.reset();

      // Initialize Core Services with fresh state
      ServiceContainer.initialize(this.eventBus, data.team1, data.team2);

      // Start Game Scene
      this.scene.start("GameScene", {
        team1: data.team1,
        team2: data.team2,
      });
    });
  }

  destroy(): void {
    // Clean up event listeners
    if (this.eventBus) {
      this.eventBus.off('ui:sceneChange', () => { });
      this.eventBus.off('ui:startGame', () => { });
    }
  }
}
