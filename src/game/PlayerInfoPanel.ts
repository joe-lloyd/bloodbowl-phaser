import Phaser from "phaser";
import { Player } from "../types/Player";

/**
 * Player Info Panel - Shows detailed player stats on hover
 */
export class PlayerInfoPanel extends Phaser.GameObjects.Container {
  private background!: Phaser.GameObjects.Rectangle;
  private nameText!: Phaser.GameObjects.Text;
  private positionText!: Phaser.GameObjects.Text;
  private statsText!: Phaser.GameObjects.Text;
  private skillsText!: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y);

    // Background
    this.background = scene.add.rectangle(0, 0, 200, 150, 0x2a2a3e, 0.95);
    this.background.setStrokeStyle(2, 0xffffff);
    this.add(this.background);

    // Title
    this.nameText = scene.add.text(-90, -60, "", {
      fontSize: "16px",
      color: "#ffffff",
      fontStyle: "bold",
    });
    this.add(this.nameText);

    // Position
    this.positionText = scene.add.text(-90, -40, "", {
      fontSize: "14px",
      color: "#aaaaaa",
    });
    this.add(this.positionText);

    // Stats
    this.statsText = scene.add.text(-90, -15, "", {
      fontSize: "14px",
      color: "#ffff44",
    });
    this.add(this.statsText);

    // Skills
    this.skillsText = scene.add.text(-90, 30, "", {
      fontSize: "12px",
      color: "#44ff44",
      wordWrap: { width: 180 },
    });
    this.add(this.skillsText);

    this.setVisible(false);
    scene.add.existing(this);
  }

  public showPlayer(player: Player, context?: { teamSide: 'top' | 'bottom', x?: number, y?: number }): void {

    // Dynamic Positioning
    if (context) {
      if (context.teamSide === 'top') {
        // Position near Top Dugout (Right Side)
        this.setPosition(1050, 100);
      } else {
        // Position near Bottom Dugout (Right Side)
        this.setPosition(1050, 700);
      }
    } else {
      // Default / Fallback
      this.setPosition(1050, 400);
    }

    this.nameText.setText(`#${player.number} ${player.name}`);
    this.positionText.setText(player.position);

    const stats = `MA:${player.stats.MA} ST:${player.stats.ST} AG:${player.stats.AG}+ PA:${player.stats.PA}+ AV:${player.stats.AV}+`;
    this.statsText.setText(stats);

    const skills =
      player.skills.length > 0
        ? `Skills: ${player.skills.map((s) => s.type).join(", ")}`
        : "No skills";
    this.skillsText.setText(skills);

    this.setVisible(true);
  }

  public hide(): void {
    this.setVisible(false);
  }
}
