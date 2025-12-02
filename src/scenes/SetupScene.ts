import Phaser from "phaser";
import { Team } from "../types/Team";
import { Player } from "../types/Player";
import { Pitch } from "../game/Pitch";
import { PlayerSprite } from "../game/PlayerSprite";
import { pixelToGrid } from "../utils/GridUtils";

/**
 * Setup Scene - Drag and drop players onto the pitch
 * Sevens rules: Setup in your third of the pitch
 */
export class SetupScene extends Phaser.Scene {
  private team1!: Team;
  private team2!: Team;
  private kickingTeam!: Team;
  private receivingTeam!: Team;
  private currentSetupTeam!: Team;

  private pitch!: Pitch;
  private playerSprites: Map<string, PlayerSprite> = new Map();
  private dugoutSprites: Map<string, Phaser.GameObjects.Container> = new Map();
  private placedPlayers: Set<string> = new Set();

  private setupPhase: "kicking" | "receiving" = "kicking";
  private confirmButton!: Phaser.GameObjects.Text;
  private instructionText!: Phaser.GameObjects.Text;

  constructor() {
    super({ key: "SetupScene" });
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
    this.currentSetupTeam = this.kickingTeam; // Kicking team sets up first
    this.setupPhase = "kicking";
    this.placedPlayers.clear();
    this.playerSprites.clear();
    this.dugoutSprites.clear();
  }

  create(): void {
    const width = this.cameras.main.width;
    const height = this.cameras.main.height;

    // Background
    this.add.rectangle(0, 0, width, height, 0x0a0a1e).setOrigin(0);

    // Create pitch
    const pitchWidth = 11 * 40;
    const pitchX = (width - pitchWidth) / 2;
    const pitchY = 100;

    this.pitch = new Pitch(this, pitchX, pitchY);

    // Create dugouts for both teams
    this.createDugout(this.team1, 20, pitchY, true);
    this.createDugout(this.team2, width - 220, pitchY, false);

    // Setup UI
    this.createUI(width);

    // Highlight initial setup zone
    this.updateSetupState();
  }

  private createUI(width: number): void {
    // Title
    this.add
      .text(width / 2, 20, "SETUP PHASE", {
        fontSize: "24px",
        color: "#ffff44",
        fontStyle: "bold",
      })
      .setOrigin(0.5);

    // Instructions
    this.instructionText = this.add
      .text(width / 2, 50, "", {
        fontSize: "18px",
        color: "#ffffff",
      })
      .setOrigin(0.5);

    // Confirm button (initially hidden)
    this.confirmButton = this.add.text(width / 2, 80, "CONFIRM SETUP", {
      fontSize: "20px",
      color: "#44ff44",
      backgroundColor: "#222222",
      padding: { x: 20, y: 10 },
    });
    this.confirmButton.setOrigin(0.5);
    this.confirmButton.setInteractive({ useHandCursor: true });
    this.confirmButton.setVisible(false);

    this.confirmButton.on("pointerover", () => {
      this.confirmButton.setStyle({
        color: "#ffffff",
        backgroundColor: "#44ff44",
      });
    });

    this.confirmButton.on("pointerout", () => {
      this.confirmButton.setStyle({
        color: "#44ff44",
        backgroundColor: "#222222",
      });
    });

    this.confirmButton.on("pointerdown", () => {
      this.confirmSetup();
    });
  }

  private updateSetupState(): void {
    this.pitch.clearHighlights();
    this.highlightSetupZone();

    const isKicking = this.setupPhase === "kicking";
    const action = isKicking ? "KICKING" : "RECEIVING";

    this.instructionText.setText(
      `${this.currentSetupTeam.name} (${action}) - Place 7 players in your zone`
    );
    this.instructionText.setColor(
      this.currentSetupTeam.colors.primary === 0xff4444 ? "#ff4444" : "#4444ff"
    );

    // Enable drag for current team's dugout sprites
    this.dugoutSprites.forEach((sprite, playerId) => {
      const player = this.getPlayerById(playerId);
      if (player && player.teamId === this.currentSetupTeam.id) {
        sprite.setInteractive({ draggable: true });
        sprite.setAlpha(1);
      } else {
        sprite.disableInteractive();
        sprite.setAlpha(0.5);
      }
    });

    this.updateConfirmButton();
  }

  private highlightSetupZone(): void {
    const isTeam1 = this.currentSetupTeam.id === this.team1.id;
    const color = isTeam1 ? 0x4444ff : 0xff4444;

    // Sevens: Setup in your third
    if (isTeam1) {
      for (let y = 0; y <= 5; y++) {
        for (let x = 0; x < 11; x++) {
          this.pitch.highlightSquare(x, y, color);
        }
      }
    } else {
      for (let y = 11; y < 17; y++) {
        for (let x = 0; x < 11; x++) {
          this.pitch.highlightSquare(x, y, color);
        }
      }
    }
  }

  private createDugout(
    team: Team,
    x: number,
    y: number,
    _isLeft: boolean
  ): void {
    // Dugout background
    this.add.rectangle(x, y, 200, 680, 0x1a1a2e, 0.8).setOrigin(0);
    this.add.rectangle(x, y, 200, 680, team.colors.primary, 0.2).setOrigin(0);

    this.add.text(x + 10, y + 10, `${team.name} (${team.race})`, {
      fontSize: "16px",
      color: "#ffffff",
      fontStyle: "bold",
      wordWrap: { width: 180 },
    });

    // Create sprites for first 7 players
    const players = team.players.slice(0, 7);
    let yOffset = y + 50;

    players.forEach((player) => {
      const sprite = this.createDugoutPlayer(
        player,
        x + 100,
        yOffset,
        team.colors.primary
      );
      this.dugoutSprites.set(player.id, sprite);
      yOffset += 60;
    });
  }

  private createDugoutPlayer(
    player: Player,
    x: number,
    y: number,
    color: number
  ): Phaser.GameObjects.Container {
    const container = this.add.container(x, y);
    container.setData("originalX", x);
    container.setData("originalY", y);
    container.setData("playerId", player.id); // Store player ID for easier lookup

    // Player circle
    const circle = this.add.circle(0, 0, 16, color);
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

    // Make draggable
    container.setSize(32, 32);
    container.setInteractive({ draggable: true, useHandCursor: true });

    // Ensure container is on top
    container.setDepth(10);

    // Drag events
    this.input.setDraggable(container); // Explicitly enable drag on input plugin

    container.on("dragstart", () => {
      container.setDepth(100); // Bring to front when dragging
    });

    container.on(
      "drag",
      (_pointer: Phaser.Input.Pointer, dragX: number, dragY: number) => {
        container.x = dragX;
        container.y = dragY;
      }
    );

    container.on("dragend", () => {
      container.setDepth(10); // Reset depth
      this.handlePlayerDrop(player, container);
    });

    return container;
  }

  private handlePlayerDrop(
    player: Player,
    sprite: Phaser.GameObjects.Container
  ): void {
    const pitchContainer = this.pitch.getContainer();
    const localX = sprite.x - pitchContainer.x;
    const localY = sprite.y - pitchContainer.y;
    const gridPos = pixelToGrid(localX, localY, 40);

    // Check if in valid setup zone
    if (this.isValidSetupPosition(gridPos.x, gridPos.y)) {
      // Check if square is occupied by ANY player
      const isOccupied = this.isSquareOccupied(gridPos.x, gridPos.y);

      if (!isOccupied) {
        // Snap to grid visually
        const pixelPos = this.pitch.getPixelPosition(gridPos.x, gridPos.y);
        sprite.x = pixelPos.x;
        sprite.y = pixelPos.y;

        // Update player data
        player.gridPosition = { x: gridPos.x, y: gridPos.y };
        this.placedPlayers.add(player.id);

        this.updateConfirmButton();
        return;
      }
    }

    // Invalid drop - return to dugout
    this.returnToDugout(sprite, player);
  }

  private returnToDugout(
    sprite: Phaser.GameObjects.Container,
    player: Player
  ): void {
    this.tweens.add({
      targets: sprite,
      x: sprite.getData("originalX"),
      y: sprite.getData("originalY"),
      duration: 200,
      onComplete: () => {
        player.gridPosition = undefined;
        this.placedPlayers.delete(player.id);
        this.updateConfirmButton();
      },
    });
  }

  private isSquareOccupied(gridX: number, gridY: number): boolean {
    // Check against all players in both teams
    const allPlayers = [...this.team1.players, ...this.team2.players];
    return allPlayers.some(
      (p) => p.gridPosition?.x === gridX && p.gridPosition?.y === gridY
    );
  }

  private isValidSetupPosition(gridX: number, gridY: number): boolean {
    if (gridX < 0 || gridX >= 11 || gridY < 0 || gridY >= 17) return false;

    const isTeam1 = this.currentSetupTeam.id === this.team1.id;
    if (isTeam1) {
      return gridY >= 0 && gridY <= 5;
    } else {
      return gridY >= 11 && gridY < 17;
    }
  }

  private updateConfirmButton(): void {
    // Check if current team has placed 7 players (or all available if < 7)
    const currentTeamPlayers = this.currentSetupTeam.players.slice(0, 7);
    const placedCount = currentTeamPlayers.filter((p) =>
      this.placedPlayers.has(p.id)
    ).length;
    const requiredCount = Math.min(7, currentTeamPlayers.length);

    this.confirmButton.setVisible(placedCount === requiredCount);
  }

  private confirmSetup(): void {
    if (this.setupPhase === "kicking") {
      // Switch to receiving team
      this.setupPhase = "receiving";
      this.currentSetupTeam = this.receivingTeam;
      this.placedPlayers.clear(); // Clear for tracking receiving team placement
      this.updateSetupState();
    } else {
      // Both teams set up - start game
      this.scene.start("GameScene", {
        team1: this.team1,
        team2: this.team2,
        kickingTeam: this.kickingTeam,
        receivingTeam: this.receivingTeam,
      });
    }
  }

  private getPlayerById(id: string): Player | undefined {
    return [...this.team1.players, ...this.team2.players].find(
      (p) => p.id === id
    );
  }
}
