import Phaser from "phaser";
import { loadTeams, deleteTeam } from "../managers/TeamManager";
import { Team } from "../types/Team";

/**
 * Team Management Scene - List, create, edit, and delete teams
 */
export class TeamManagementScene extends Phaser.Scene {
  private teams: Team[] = [];

  constructor() {
    super({ key: "TeamManagementScene" });
  }

  create(): void {
    const width = this.cameras.main.width;
    const height = this.cameras.main.height;

    // Background
    this.add.rectangle(0, 0, width, height, 0x1a1a2e).setOrigin(0);

    // Title
    this.add
      .text(width / 2, 40, "TEAM MANAGEMENT", {
        fontSize: "36px",
        color: "#44ff44",
        fontStyle: "bold",
      })
      .setOrigin(0.5);

    // Load teams
    this.teams = loadTeams();

    // Create new team button
    const createButton = this.add.text(width / 2, 100, "+ Create New Team", {
      fontSize: "24px",
      color: "#44ff44",
      backgroundColor: "#222222",
      padding: { x: 20, y: 10 },
    });
    createButton.setOrigin(0.5);
    createButton.setInteractive({ useHandCursor: true });

    createButton.on("pointerover", () => {
      createButton.setStyle({ color: "#ffffff", backgroundColor: "#44ff44" });
    });

    createButton.on("pointerout", () => {
      createButton.setStyle({ color: "#44ff44", backgroundColor: "#222222" });
    });

    createButton.on("pointerdown", () => {
      this.scene.start("TeamBuilderScene");
    });

    // Team list
    this.displayTeamList(width, 160);

    // Back button
    this.createBackButton(width, height);
  }

  private displayTeamList(width: number, startY: number): void {
    if (this.teams.length === 0) {
      this.add
        .text(width / 2, startY + 50, "No teams created yet", {
          fontSize: "20px",
          color: "#888888",
        })
        .setOrigin(0.5);
      return;
    }

    let yOffset = startY;

    this.teams.forEach((team) => {
      // Team container
      this.add.rectangle(width / 2, yOffset, 700, 80, 0x2a2a3e);

      // Team name and race
      this.add.text(
        width / 2 - 320,
        yOffset - 20,
        `${team.name} (${team.rosterName})`,
        {
          fontSize: "24px",
          color: "#ffffff",
          fontStyle: "bold",
        }
      );

      this.add.text(
        width / 2 - 320,
        yOffset + 10,
        `${team.rosterName} • ${team.players.length} players • ${this.formatGold(
          team.treasury
        )} treasury`,
        {
          fontSize: "16px",
          color: "#aaaaaa",
        }
      );

      // Edit button
      const editButton = this.add.text(width / 2 + 150, yOffset, "[Edit]", {
        fontSize: "18px",
        color: "#4444ff",
        backgroundColor: "#222222",
        padding: { x: 10, y: 5 },
      });
      editButton.setOrigin(0.5);
      editButton.setInteractive({ useHandCursor: true });
      editButton.on("pointerdown", () => {
        // TODO: Load team into builder
        this.scene.start("TeamBuilderScene", { teamId: team.id });
      });

      // Delete button
      const deleteButton = this.add.text(width / 2 + 250, yOffset, "[Delete]", {
        fontSize: "18px",
        color: "#ff4444",
        backgroundColor: "#222222",
        padding: { x: 10, y: 5 },
      });
      deleteButton.setOrigin(0.5);
      deleteButton.setInteractive({ useHandCursor: true });
      deleteButton.on("pointerdown", () => {
        deleteTeam(team.id);
        this.scene.restart();
      });

      yOffset += 100;
    });
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

  private formatGold(amount: number): string {
    return `${(amount / 1000).toFixed(0)}k`;
  }
}
