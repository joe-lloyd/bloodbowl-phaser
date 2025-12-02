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
  private kickingTeam!: Team;
  private receivingTeam!: Team;
  private playerSprites: Map<string, PlayerSprite> = new Map();
  private playerInfoPanel!: PlayerInfoPanel;

  constructor() {
    super({ key: "GameScene" });
  }

  init(data: {
    team1: Team;
    team2: Team;
    kickingTeam: Team;
    receivingTeam: Team;
  }): void {
    this.team1 = data.team1;
    this.team2 = data.team2;
    this.kickingTeam = data.kickingTeam;
    this.receivingTeam = data.receivingTeam;
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
    this.add.rectangle(20, 20, 200, 60, team1Color, 0.3).setOrigin(0);
    this.add.text(30, 30, `${this.team1.name} (${this.team1.race})`, {
      fontSize: "18px",
      color: "#ffffff",
      fontStyle: "bold",
    });

    // Team 2 header (right side)
    this.add.rectangle(width - 220, 20, 200, 60, team2Color, 0.3).setOrigin(0);
    this.add.text(width - 210, 30, `${this.team2.name} (${this.team2.race})`, {
      fontSize: "18px",
      color: "#ffffff",
      fontStyle: "bold",
    });

    // Create pitch (centered)
    const pitchWidth = 11 * 40;
    const pitchX = (width - pitchWidth) / 2;
    const pitchY = 100;

    this.pitch = new Pitch(this, pitchX, pitchY);

    // Create dugouts (narrower: 150px)
    this.createDugout(team1Color, 20, pitchY, this.team1, true);
    this.createDugout(team2Color, width - 170, pitchY, this.team2, false);

    // Place players from setup
    this.placePlayersFromSetup();

    // Player info panel (right side, under dugout for now or floating)
    // User asked for "under the teams dugout for which team the player you hover"
    // Since we have limited space, let's put a single panel that updates based on hover
    // Position it in the bottom right corner for now, or maybe create two instances?
    // Let's stick to one panel but position it better.
    // Actually, let's put it under the right dugout as a default location
    this.playerInfoPanel = new PlayerInfoPanel(this, width - 170, pitchY + 400);

    // Listen for player hover events
    this.events.on("showPlayerInfo", (player: Player) => {
      // Move panel to the side of the player's team if possible?
      // For now, just show it.
      this.playerInfoPanel.showPlayer(player);
    });

    this.events.on("hidePlayerInfo", () => {
      this.playerInfoPanel.hide();
    });

    // Back button
    this.createBackButton();

    // Info text
    this.add
      .text(
        width / 2,
        height - 30,
        `Game Started! ${this.kickingTeam.name} kicks to ${this.receivingTeam.name}`,
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
    this.add.rectangle(x, y, 150, 680, 0x1a1a2e, 0.8).setOrigin(0);
    this.add.rectangle(x, y, 150, 680, color, 0.2).setOrigin(0);

    // Title
    this.add.text(x + 10, y + 10, "DUGOUT", {
      fontSize: "14px",
      color: "#ffffff",
      fontStyle: "bold",
    });

    // Show only players NOT on the pitch (Reserves/KO/Injured)
    // For now, just check if they have a gridPosition
    const dugoutPlayers = team.players.filter((p) => !p.gridPosition);

    let yOffset = y + 40;
    dugoutPlayers.forEach((player) => {
      this.createDugoutPlayerDisplay(player, x + 75, yOffset, color);
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

  private placePlayersFromSetup(): void {
    // Place Team 1 players
    this.team1.players.forEach((player) => {
      if (player.gridPosition) {
        this.placePlayer(
          player,
          player.gridPosition.x,
          player.gridPosition.y,
          this.team1.colors.primary
        );
      }
    });

    // Place Team 2 players
    this.team2.players.forEach((player) => {
      if (player.gridPosition) {
        this.placePlayer(
          player,
          player.gridPosition.x,
          player.gridPosition.y,
          this.team2.colors.primary
        );
      }
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

    // Update player's grid position (redundant but safe)
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
