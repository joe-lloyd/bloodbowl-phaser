import Phaser from "phaser";
import { loadTeams } from "../managers/TeamManager";
import { Team } from "../types/Team";
import { EventBus } from "../services/EventBus";

/**
 * Team Management Scene - List, create, edit, and delete teams
 * UI now handled by React overlay
 */
export class TeamManagementScene extends Phaser.Scene {
  private teams: Team[] = [];
  private eventBus!: EventBus;

  constructor() {
    super({ key: "TeamManagementScene" });
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

    // Load teams (kept for potential Phaser background logic)
    this.teams = loadTeams();
  }

  destroy(): void {
    // Clean up event listeners
    if (this.eventBus) {
      this.eventBus.off('ui:sceneChange', () => { });
    }
  }
}
