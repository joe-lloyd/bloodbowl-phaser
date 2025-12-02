import Phaser from "phaser";
import { Team } from "../types/Team";

/**
 * Coin Flip Scene - Determine who kicks and who receives
 */
export class CoinFlipScene extends Phaser.Scene {
  private team1!: Team;
  private team2!: Team;
  private kickingTeam!: Team;
  private receivingTeam!: Team;

  constructor() {
    super({ key: "CoinFlipScene" });
  }

  init(data: { team1: Team; team2: Team }): void {
    this.team1 = data.team1;
    this.team2 = data.team2;
  }

  create(): void {
    const width = this.cameras.main.width;
    const height = this.cameras.main.height;

    // Background
    this.add.rectangle(0, 0, width, height, 0x1a1a2e).setOrigin(0);

    // Title
    this.add
      .text(width / 2, 100, "COIN FLIP", {
        fontSize: "48px",
        color: "#ffff44",
        fontStyle: "bold",
      })
      .setOrigin(0.5);

    // Teams
    this.add
      .text(width / 2, 200, `${this.team1.name} vs ${this.team2.name}`, {
        fontSize: "24px",
        color: "#ffffff",
      })
      .setOrigin(0.5);

    // Instructions
    this.add
      .text(width / 2, 280, "Who will kick off?", {
        fontSize: "20px",
        color: "#aaaaaa",
      })
      .setOrigin(0.5);

    // Coin flip button
    const flipButton = this.add.text(width / 2, 360, "FLIP COIN", {
      fontSize: "32px",
      color: "#44ff44",
      backgroundColor: "#222222",
      padding: { x: 30, y: 15 },
    });
    flipButton.setOrigin(0.5);
    flipButton.setInteractive({ useHandCursor: true });

    flipButton.on("pointerover", () => {
      flipButton.setStyle({ color: "#ffffff", backgroundColor: "#44ff44" });
    });

    flipButton.on("pointerout", () => {
      flipButton.setStyle({ color: "#44ff44", backgroundColor: "#222222" });
    });

    flipButton.on("pointerdown", () => {
      this.performCoinFlip(width, height, flipButton);
    });
  }

  private performCoinFlip(
    width: number,
    height: number,
    button: Phaser.GameObjects.Text
  ): void {
    button.setVisible(false);

    // Animate coin flip
    const coin = this.add.text(width / 2, 360, "🪙", {
      fontSize: "64px",
    });
    coin.setOrigin(0.5);

    // Spin animation
    this.tweens.add({
      targets: coin,
      angle: 720,
      duration: 1000,
      ease: "Cubic.easeOut",
      onComplete: () => {
        // Random result
        const team1Kicks = Math.random() < 0.5;

        if (team1Kicks) {
          this.kickingTeam = this.team1;
          this.receivingTeam = this.team2;
        } else {
          this.kickingTeam = this.team2;
          this.receivingTeam = this.team1;
        }

        coin.destroy();
        this.showResult(width, height);
      },
    });
  }

  private showResult(width: number, _height: number): void {
    // Result text
    this.add
      .text(width / 2, 300, `${this.kickingTeam.name} will KICK OFF`, {
        fontSize: "28px",
        color: "#ff4444",
        fontStyle: "bold",
      })
      .setOrigin(0.5);

    this.add
      .text(width / 2, 350, `${this.receivingTeam.name} will RECEIVE`, {
        fontSize: "28px",
        color: "#4444ff",
        fontStyle: "bold",
      })
      .setOrigin(0.5);

    // Continue button
    const continueButton = this.add.text(
      width / 2,
      450,
      "Continue to Setup →",
      {
        fontSize: "24px",
        color: "#44ff44",
        backgroundColor: "#222222",
        padding: { x: 20, y: 10 },
      }
    );
    continueButton.setOrigin(0.5);
    continueButton.setInteractive({ useHandCursor: true });

    continueButton.on("pointerover", () => {
      continueButton.setStyle({ color: "#ffffff", backgroundColor: "#44ff44" });
    });

    continueButton.on("pointerout", () => {
      continueButton.setStyle({ color: "#44ff44", backgroundColor: "#222222" });
    });

    continueButton.on("pointerdown", () => {
      // Move to setup scene
      this.scene.start("SetupScene", {
        team1: this.team1,
        team2: this.team2,
        kickingTeam: this.kickingTeam,
        receivingTeam: this.receivingTeam,
      });
    });
  }
}
