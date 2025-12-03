import Phaser from "phaser";
import { loadTeams } from "../managers/TeamManager";
import { Team } from "../types/Team";

/**
 * Team Selection Scene - Select teams for Player 1 and Player 2
 */
export class TeamSelectionScene extends Phaser.Scene {
  private teams: Team[] = [];
  private selectedTeam1: Team | null = null;
  private selectedTeam2: Team | null = null;

  constructor() {
    super({ key: "TeamSelectionScene" });
  }

  create(): void {
    const width = this.cameras.main.width;
    const height = this.cameras.main.height;

    // Background
    this.add.rectangle(0, 0, width, height, 0x1a1a2e).setOrigin(0);

    // Title
    this.add
      .text(width / 2, 40, "TEAM SELECTION", {
        fontSize: "36px",
        color: "#4444ff",
        fontStyle: "bold",
      })
      .setOrigin(0.5);

    // Game type
    this.add
      .text(width / 2, 100, "Friendly Sevens Match", {
        fontSize: "24px",
        color: "#ffffff",
      })
      .setOrigin(0.5);

    // Load teams
    this.teams = loadTeams();

    if (this.teams.length < 2) {
      this.showInsufficientTeamsMessage(width, height);
      return;
    }

    // Player 1 selection
    this.createPlayerSelection(width / 2 - 250, 160, "Player 1", 1);

    // VS text
    this.add
      .text(width / 2, 350, "VS", {
        fontSize: "48px",
        color: "#ff4444",
        fontStyle: "bold",
      })
      .setOrigin(0.5);

    // Player 2 selection
    this.createPlayerSelection(width / 2 + 250, 160, "Player 2", 2);

    // Start game button (initially disabled)
    this.createStartButton(width, height);

    // Back button
    this.createBackButton(width, height);
  }

  private showInsufficientTeamsMessage(width: number, height: number): void {
    this.add
      .text(width / 2, height / 2 - 50, "You need at least 2 teams to play!", {
        fontSize: "24px",
        color: "#ff4444",
      })
      .setOrigin(0.5);

    this.add
      .text(
        width / 2,
        height / 2 + 20,
        "Go to Build Team to create teams first.",
        {
          fontSize: "18px",
          color: "#aaaaaa",
        }
      )
      .setOrigin(0.5);

    this.createBackButton(width, height);
  }

  private createPlayerSelection(
    x: number,
    y: number,
    label: string,
    playerNum: number
  ): void {
    // Label
    this.add
      .text(x, y, label, {
        fontSize: "24px",
        color: "#ffffff",
        fontStyle: "bold",
      })
      .setOrigin(0.5);

    // Team selection dropdown (simplified as buttons)
    let yOffset = y + 50;

    this.teams.forEach((team) => {
      const isSelected =
        (playerNum === 1 && this.selectedTeam1?.id === team.id) ||
        (playerNum === 2 && this.selectedTeam2?.id === team.id);

      const button = this.add.text(x, yOffset, `${team.name} (${team.race})`, {
        fontSize: "18px",
        color: isSelected ? "#ffffff" : "#aaaaaa",
        backgroundColor: isSelected ? "#44ff44" : "#333333",
        padding: { x: 20, y: 10 },
      });
      button.setOrigin(0.5);
      button.setInteractive({ useHandCursor: true });

      button.on("pointerover", () => {
        if (!isSelected) {
          button.setStyle({ backgroundColor: "#555555" });
        }
      });

      button.on("pointerout", () => {
        if (!isSelected) {
          button.setStyle({ backgroundColor: "#333333" });
        }
      });

      button.on("pointerdown", () => {
        if (playerNum === 1) {
          this.selectedTeam1 = team;
        } else {
          this.selectedTeam2 = team;
        }
        this.scene.restart();
      });

      yOffset += 50;
    });
  }

  private createStartButton(width: number, height: number): void {
    const canStart =
      this.selectedTeam1 !== null &&
      this.selectedTeam2 !== null &&
      this.selectedTeam1.id !== this.selectedTeam2.id;

    const startButton = this.add.text(
      width - 200,
      height - 60,
      "Start Game →",
      {
        fontSize: "24px",
        color: canStart ? "#44ff44" : "#666666",
        backgroundColor: "#222222",
        padding: { x: 20, y: 10 },
      }
    );

    if (canStart) {
      startButton.setInteractive({ useHandCursor: true });
      startButton.on("pointerover", () => {
        startButton.setStyle({ color: "#ffffff", backgroundColor: "#44ff44" });
      });
      startButton.on("pointerout", () => {
        startButton.setStyle({ color: "#44ff44", backgroundColor: "#222222" });
      });
      startButton.on("pointerdown", () => {
        // Start Setup Scene directly (Coin flip is now part of Setup)
        this.scene.start("SetupScene", {
          team1: this.selectedTeam1!,
          team2: this.selectedTeam2!,
        });
      });
    }
  }

  private createBackButton(_width: number, height: number): void {
    const backButton = this.add.text(50, height - 60, "← Back to Menu", {
      fontSize: "20px",
      color: "#ff4444",
      backgroundColor: "#222222",
      padding: { x: 15, y: 10 },
    });

    backButton.setInteractive({ useHandCursor: true });
    backButton.on("pointerover", () => {
      backButton.setStyle({ color: "#ffffff", backgroundColor: "#ff4444" });
    });
    backButton.on("pointerout", () => {
      backButton.setStyle({ color: "#ff4444", backgroundColor: "#222222" });
    });
    backButton.on("pointerdown", () => {
      this.scene.start("MenuScene");
    });
  }
}
