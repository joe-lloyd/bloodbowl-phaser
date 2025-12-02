import Phaser from "phaser";
import { Pitch } from "../game/Pitch";
import { PlayerSprite } from "../game/PlayerSprite";
import { PlayerInfoPanel } from "../game/PlayerInfoPanel";
import { Team } from "../types/Team";
import { Player, PlayerStatus } from "../types/Player";

/**
 * Game Scene - Main gameplay scene with pitch and players
 */
export class GameScene extends Phaser.Scene {
  private pitch!: Pitch;
  private team1!: Team;
  private team2!: Team;
  private playerSprites: Map<string, PlayerSprite> = new Map();
  private playerInfoPanel!: PlayerInfoPanel;

  constructor() {
    super({ key: "GameScene" });
  }

  init(data: {
    team1: Team;
    team2: Team;
    kickingTeam?: Team;
    receivingTeam?: Team;
  }): void {
    this.team1 = data.team1;
    this.team2 = data.team2;
  }

  create(): void {
    const width = this.cameras.main.width;
    const height = this.cameras.main.height;

    // Background
    this.add.rectangle(0, 0, width, height, 0x0a0a1e).setOrigin(0);

    // Team names and colors
    const team1Color = this.team1.colors.primary;
    const team2Color = this.team2.colors.primary;

    // Team 1 header (left side)
    this.add.rectangle(20, 20, 250, 60, team1Color, 0.3).setOrigin(0);
    this.add.text(30, 30, `${this.team1.name} (${this.team1.race})`, {
      fontSize: "20px",
      color: "#ffffff",
      fontStyle: "bold",
    });

    // Team 2 header (right side)
    this.add.rectangle(width - 270, 20, 250, 60, team2Color, 0.3).setOrigin(0);
    this.add.text(width - 260, 30, `${this.team2.name} (${this.team2.race})`, {
      fontSize: "20px",
      color: "#ffffff",
      fontStyle: "bold",
    });

    // Create pitch (centered)
    const pitchWidth = 11 * 40;
    const pitchX = (width - pitchWidth) / 2;
    const pitchY = 100;

    this.pitch = new Pitch(this, pitchX, pitchY);

    // Player info panel (right side)
    this.playerInfoPanel = new PlayerInfoPanel(this, width - 130, height / 2);

    // Listen for player hover events
    this.events.on("showPlayerInfo", (player: Player) => {
      this.playerInfoPanel.showPlayer(player);
    });

    this.events.on("hidePlayerInfo", () => {
      this.playerInfoPanel.hide();
    });

    // Create dugouts
    this.createDugout(team1Color, 20, pitchY, this.team1, true);
    this.createDugout(team2Color, width - 220, pitchY, this.team2, false);

    // Place players for testing (we'll do proper setup in Phase 12)
    this.placeTestPlayers();

    // Back button
    this.createBackButton();

    // Info text
    this.add
      .text(
        width / 2,
        height - 30,
        "Phase 4.5: Setup Complete! (Turn order coming next)",
        {
          fontSize: "16px",
          color: "#888888",
        }
      )
      .setOrigin(0.5);
  }

  private createDugout(
    color: number,
    x: number,
    y: number,
    team: Team,
    _isLeft: boolean
  ): void {
    // Dugout background
    this.add.rectangle(x, y, 200, 680, 0x1a1a2e, 0.8).setOrigin(0);
    this.add.rectangle(x, y, 200, 680, color, 0.2).setOrigin(0);

    // Title
    this.add.text(x + 10, y + 10, "DUGOUT", {
      fontSize: "14px",
      color: "#ffffff",
      fontStyle: "bold",
    });

    // Show all players
    let yOffset = y + 40;
    team.players.forEach((player) => {
      this.createDugoutPlayerDisplay(player, x + 100, yOffset, color);
      yOffset += 60;
    });
  }

  private createDugoutPlayerDisplay(
    player: Player,
    x: number,
    y: number,
    teamColor: number
  ): Phaser.GameObjects.Container {
    const container = this.add.container(x, y);

    // Player circle
    const circle = this.add.circle(0, 0, 16, teamColor);
    circle.setStrokeStyle(2, 0xffffff);
    container.add(circle);

    // Player number
    const numberText = this.add.text(0, 0, player.number.toString(), {
      fontSize: "14px",
      color: "#ffffff",
      fontStyle: "bold",
    });
    numberText.setOrigin(0.5);
    container.add(numberText);

    // Player name (small)
    const nameText = this.add.text(25, -5, `#${player.number}`, {
      fontSize: "12px",
      color: "#aaaaaa",
    });
    container.add(nameText);

    // Make interactive for hover
    container.setSize(32, 32);
    container.setInteractive({ useHandCursor: true });

    container.on("pointerover", () => {
      circle.setScale(1.2);
      this.events.emit("showPlayerInfo", player);
    });

    container.on("pointerout", () => {
      circle.setScale(1.0);
      this.events.emit("hidePlayerInfo");
    });

    return container;
  }

  private placeTestPlayers(): void {
    // Place Team 1 players (top half)
    const team1Players = this.team1.players.slice(0, 7);
    team1Players.forEach((player, index) => {
      const gridX = 2 + index;
      const gridY = 2;
      this.placePlayer(player, gridX, gridY, this.team1.colors.primary);
    });

    // Place Team 2 players (bottom half)
    const team2Players = this.team2.players.slice(0, 7);
    team2Players.forEach((player, index) => {
      const gridX = 2 + index;
      const gridY = 14;
      this.placePlayer(player, gridX, gridY, this.team2.colors.primary);
    });
  }

  private placePlayer(
    player: Player,
    gridX: number,
    gridY: number,
    teamColor: number
  ): void {
    const pos = this.pitch.getPixelPosition(gridX, gridY);
    const sprite = new PlayerSprite(this, pos.x, pos.y, player, teamColor);
    this.playerSprites.set(player.id, sprite);

    // Update player's grid position
    player.gridPosition = { x: gridX, y: gridY };
    player.status = PlayerStatus.ACTIVE;
  }

  private createBackButton(): void {
    const backButton = this.add.text(20, 20, "← Back", {
      fontSize: "18px",
      color: "#ff4444",
      backgroundColor: "#222222",
      padding: { x: 10, y: 5 },
    });

    backButton.setInteractive({ useHandCursor: true });
    backButton.on("pointerover", () => {
      backButton.setStyle({ color: "#ffffff", backgroundColor: "#ff4444" });
    });
    backButton.on("pointerout", () => {
      backButton.setStyle({ color: "#ff4444", backgroundColor: "#222222" });
    });
    backButton.on("pointerdown", () => {
      this.scene.start("GameSetupScene");
    });
  }
}
