import Phaser from "phaser";
import { UIText, UIButton } from "../ui";

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
    UIText.createTitle(
      this,
      width / 2,
      height / 3,
      "BLOOD BOWL SEVENS",
      "#ff4444"
    );

    // Subtitle
    UIText.createSubtitle(
      this,
      width / 2,
      height / 3 + 60,
      "Fantasy Football Mayhem"
    );

    // Menu buttons
    const buttonY = height / 2 + 20;
    const buttonSpacing = 70;

    // Build Team button
    new UIButton(this, {
      x: width / 2,
      y: buttonY,
      text: "Build Team",
      variant: "large",
      onClick: () => this.scene.start("TeamManagementScene"),
    });

    // Play Game button
    new UIButton(this, {
      x: width / 2,
      y: buttonY + buttonSpacing,
      text: "Play Game",
      variant: "large",
      fontSize: "32px",
      onClick: () => this.scene.start("TeamSelectionScene"),
    });

    // Version info
    new UIText(this, {
      x: width - 10,
      y: height - 10,
      text: "v0.1.0 - Phase 3.5",
      variant: "small",
      color: "#888888",
      origin: { x: 1, y: 1 },
    });
  }
}
