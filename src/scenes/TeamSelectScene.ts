import Phaser from "phaser";
import { loadTeams } from "../managers/TeamManager";
import { Team } from "../types/Team";
import { UIText, UIButton } from "../ui";

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
    new UIText(this, {
      x: width / 2,
      y: 40,
      text: "TEAM SELECTION",
      variant: "h2",
      color: "#4444ff",
      fontStyle: "bold",
    });

    // Game type
    new UIText(this, {
      x: width / 2,
      y: 100,
      text: "Friendly Sevens Match",
      variant: "h4",
    });

    // Load teams
    this.teams = loadTeams();

    if (this.teams.length < 2) {
      this.showInsufficientTeamsMessage(width, height);
      return;
    }

    // Player 1 selection
    this.createPlayerSelection(width / 2 - 250, 160, "Player 1", 1);

    // VS text
    new UIText(this, {
      x: width / 2,
      y: 350,
      text: "VS",
      variant: "h1",
      color: "#ff4444",
      fontStyle: "bold",
    });

    // Player 2 selection
    this.createPlayerSelection(width / 2 + 250, 160, "Player 2", 2);

    // Start game button (initially disabled)
    this.createStartButton(width, height);

    // Back button
    this.createBackButton(width, height);
  }

  private showInsufficientTeamsMessage(width: number, height: number): void {
    new UIText(this, {
      x: width / 2,
      y: height / 2 - 50,
      text: "You need at least 2 teams to play!",
      variant: "h4",
      color: "#ff4444",
    });

    new UIText(this, {
      x: width / 2,
      y: height / 2 + 20,
      text: "Go to Build Team to create teams first.",
      variant: "h6",
      color: "#aaaaaa",
    });

    this.createBackButton(width, height);
  }

  private createPlayerSelection(
    x: number,
    y: number,
    label: string,
    playerNum: number
  ): void {
    // Label
    new UIText(this, {
      x,
      y,
      text: label,
      variant: "h4",
      fontStyle: "bold",
    });

    // Team selection buttons
    let yOffset = y + 50;

    this.teams.forEach((team) => {
      const isSelected =
        (playerNum === 1 && this.selectedTeam1?.id === team.id) ||
        (playerNum === 2 && this.selectedTeam2?.id === team.id);

      new UIButton(this, {
        x,
        y: yOffset,
        text: `${team.name} (${team.race})`,
        variant: isSelected ? "success" : "secondary",
        fontSize: "18px",
        onClick: () => {
          if (playerNum === 1) {
            this.selectedTeam1 = team;
          } else {
            this.selectedTeam2 = team;
          }
          this.scene.restart();
        },
      });

      yOffset += 50;
    });
  }

  private createStartButton(width: number, height: number): void {
    const canStart =
      this.selectedTeam1 !== null &&
      this.selectedTeam2 !== null &&
      this.selectedTeam1.id !== this.selectedTeam2.id;

    new UIButton(this, {
      x: width - 200,
      y: height - 60,
      text: "Start Game →",
      variant: "success",
      fontSize: "24px",
      disabled: !canStart,
      onClick: () => {
        // Start Setup Scene directly (Coin flip is now part of Setup)
        this.scene.start("SetupScene", {
          team1: this.selectedTeam1!,
          team2: this.selectedTeam2!,
        });
      },
    });
  }

  private createBackButton(_width: number, height: number): void {
    new UIButton(this, {
      x: 50,
      y: height - 60,
      text: "← Back to Menu",
      variant: "danger",
      fontSize: "20px",
      onClick: () => this.scene.start("MenuScene"),
      origin: { x: 0, y: 0.5 },
    });
  }
}
