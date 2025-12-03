import Phaser from "phaser";

/**
 * Menu Scene - Main menu with improved navigation
 */
export class MenuScene extends Phaser.Scene {
  constructor() {
    super({ key: "MenuScene" });
  }

  create(): void {
    const width = this.cameras.main.width;
    const height = this.cameras.main.height;

    // Background
    this.add.rectangle(0, 0, width, height, 0x1a1a2e).setOrigin(0);

    // Title
    const title = this.add.text(width / 2, height / 3, "BLOOD BOWL SEVENS", {
      fontSize: "48px",
      color: "#ff4444",
      fontStyle: "bold",
    });
    title.setOrigin(0.5);

    // Subtitle
    const subtitle = this.add.text(
      width / 2,
      height / 3 + 60,
      "Fantasy Football Mayhem",
      {
        fontSize: "24px",
        color: "#ffffff",
      }
    );
    subtitle.setOrigin(0.5);

    // Menu buttons
    const buttonY = height / 2 + 20;
    const buttonSpacing = 70;

    // Build Team button
    this.createMenuButton(width / 2, buttonY, "Build Team", "#44ff44", () =>
      this.scene.start("TeamManagementScene")
    );

    // Play Game button
    this.createMenuButton(
      width / 2,
      buttonY + buttonSpacing,
      "Play Game",
      "#4444ff",
      () => this.scene.start("TeamSelectionScene")
    );

    // Version info
    const version = this.add.text(
      width - 10,
      height - 10,
      "v0.1.0 - Phase 3.5",
      {
        fontSize: "14px",
        color: "#888888",
      }
    );
    version.setOrigin(1, 1);
  }

  private createMenuButton(
    x: number,
    y: number,
    text: string,
    color: string,
    onClick: () => void
  ): void {
    const button = this.add.text(x, y, text, {
      fontSize: "32px",
      color: color,
      backgroundColor: "#222222",
      padding: { x: 30, y: 15 },
    });
    button.setOrigin(0.5);
    button.setInteractive({ useHandCursor: true });

    button.on("pointerover", () => {
      button.setStyle({ color: "#ffffff", backgroundColor: color });
    });

    button.on("pointerout", () => {
      button.setStyle({ color: color, backgroundColor: "#222222" });
    });

    button.on("pointerdown", onClick);
  }
}
