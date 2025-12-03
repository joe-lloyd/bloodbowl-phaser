import Phaser from "phaser";
import { Team } from "../types/Team";
import { Player } from "../types/Player";
import { Pitch } from "../game/Pitch";
import { PlayerSprite } from "../game/PlayerSprite";
import { pixelToGrid } from "../utils/GridUtils";

/**
 * Setup Scene - Drag and drop players onto the pitch
 * Includes Coin Flip to determine setup order
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

  private setupPhase: "coinflip" | "kicking" | "receiving" = "coinflip";
  private confirmButton!: Phaser.GameObjects.Text;
  private instructionText!: Phaser.GameObjects.Text;

  // Coin Flip UI
  private coinFlipContainer!: Phaser.GameObjects.Container;

  constructor() {
    super({ key: "SetupScene" });
  }

  init(data: { team1: Team; team2: Team }): void {
    this.team1 = data.team1;
    this.team2 = data.team2;
    this.placedPlayers.clear();
    this.playerSprites.clear();
    this.dugoutSprites.clear();
    this.setupPhase = "coinflip";
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

    // Create dugouts for both teams (narrower: 150px)
    this.createDugout(this.team1, 20, pitchY, true);
    this.createDugout(this.team2, width - 170, pitchY, false);

    // Setup UI
    this.createUI(width);

    // Start with Coin Flip
    this.createCoinFlipOverlay(width, height);
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
      .text(width / 2, 50, "Waiting for Coin Flip...", {
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

  private createCoinFlipOverlay(width: number, height: number): void {
    this.coinFlipContainer = this.add.container(0, 0);

    // Dark overlay
    const overlay = this.add
      .rectangle(0, 0, width, height, 0x000000, 0.7)
      .setOrigin(0);
    overlay.setInteractive(); // Block clicks below
    this.coinFlipContainer.add(overlay);

    // Title
    const title = this.add
      .text(width / 2, height / 2 - 100, "COIN FLIP", {
        fontSize: "48px",
        color: "#ffff44",
        fontStyle: "bold",
      })
      .setOrigin(0.5);
    this.coinFlipContainer.add(title);

    // Flip Button
    const flipButton = this.add
      .text(width / 2, height / 2, "FLIP COIN", {
        fontSize: "32px",
        color: "#44ff44",
        backgroundColor: "#222222",
        padding: { x: 30, y: 15 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });

    this.coinFlipContainer.add(flipButton);

    flipButton.on("pointerdown", () => {
      flipButton.destroy();
      this.performCoinFlip(width, height);
    });
  }

  private performCoinFlip(width: number, height: number): void {
    const coin = this.add
      .text(width / 2, height / 2, "🪙", { fontSize: "64px" })
      .setOrigin(0.5);
    this.coinFlipContainer.add(coin);

    this.tweens.add({
      targets: coin,
      angle: 720,
      duration: 1000,
      ease: "Cubic.easeOut",
      onComplete: () => {
        const team1Wins = Math.random() < 0.5;
        const winner = team1Wins ? this.team1 : this.team2;
        const loser = team1Wins ? this.team2 : this.team1;

        coin.destroy();
        this.showCoinFlipResult(width, height, winner, loser);
      },
    });
  }

  private showCoinFlipResult(
    width: number,
    height: number,
    winner: Team,
    loser: Team
  ): void {
    const resultText = this.add
      .text(width / 2, height / 2 - 50, `${winner.name} wins the toss!`, {
        fontSize: "32px",
        color: "#ffffff",
        fontStyle: "bold",
      })
      .setOrigin(0.5);
    this.coinFlipContainer.add(resultText);

    // Choices
    const kickButton = this.add
      .text(width / 2 - 100, height / 2 + 50, "KICK", {
        fontSize: "24px",
        color: "#ffffff",
        backgroundColor: "#4444ff",
        padding: { x: 20, y: 10 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });

    const receiveButton = this.add
      .text(width / 2 + 100, height / 2 + 50, "RECEIVE", {
        fontSize: "24px",
        color: "#ffffff",
        backgroundColor: "#ff4444",
        padding: { x: 20, y: 10 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });

    this.coinFlipContainer.add([kickButton, receiveButton]);

    kickButton.on("pointerdown", () => {
      this.kickingTeam = winner;
      this.receivingTeam = loser;
      this.startSetup();
    });

    receiveButton.on("pointerdown", () => {
      this.kickingTeam = loser;
      this.receivingTeam = winner;
      this.startSetup();
    });
  }

  private startSetup(): void {
    this.coinFlipContainer.destroy();
    this.currentSetupTeam = this.kickingTeam;
    this.setupPhase = "kicking";
    this.updateSetupState();
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

    // Update Formation UI visibility
    this.formationContainers.forEach((container, teamId) => {
      container.setVisible(teamId === this.currentSetupTeam.id);
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
    // Dugout Backgrounds
    // Reserves (Top) - Height 400
    this.add.rectangle(x, y, 120, 400, 0x1a1a2e, 0.8).setOrigin(0);
    this.add.rectangle(x, y, 120, 400, team.colors.primary, 0.2).setOrigin(0);
    this.add.text(x + 10, y + 10, `${team.name} - Reserves`, {
      fontSize: "12px",
      color: "#fff",
      fontStyle: "bold",
      wordWrap: { width: 100 },
    });

    // KO (Middle) - Height 120
    const koY = y + 410;
    this.add.rectangle(x, koY, 120, 120, 0x1a1a2e, 0.8).setOrigin(0);
    this.add.rectangle(x, koY, 120, 120, 0xffaa00, 0.1).setOrigin(0); // Orange tint
    this.add.text(x + 10, koY + 5, "KO", {
      fontSize: "12px",
      color: "#ffa",
      fontStyle: "bold",
    });

    // Dead/Injured (Bottom) - Height 120
    const deadY = koY + 130;
    this.add.rectangle(x, deadY, 120, 120, 0x1a1a2e, 0.8).setOrigin(0);
    this.add.rectangle(x, deadY, 120, 120, 0xff0000, 0.1).setOrigin(0); // Red tint
    this.add.text(x + 10, deadY + 5, "Dead & Injured", {
      fontSize: "12px",
      color: "#f88",
      fontStyle: "bold",
    });

    // Filter players
    const reserves = team.players.filter(
      (p) =>
        !p.gridPosition &&
        p.status !== "KO" &&
        p.status !== "Injured" &&
        p.status !== "Dead"
    );
    const koPlayers = team.players.filter((p) => p.status === "KO");
    const deadPlayers = team.players.filter(
      (p) => p.status === "Injured" || p.status === "Dead"
    );

    // Render Reserves (2 columns)
    this.renderPlayerGroup(reserves, x, y + 30, true, team.colors.primary);

    // Render KO (2 columns)
    this.renderPlayerGroup(koPlayers, x, koY + 25, false, team.colors.primary);

    // Render Dead/Injured (2 columns)
    this.renderPlayerGroup(
      deadPlayers,
      x,
      deadY + 25,
      false,
      team.colors.primary
    );

    // Formation Buttons
    this.createFormationUI(team, x, y + 660);
  }

  private renderPlayerGroup(
    players: Player[],
    startX: number,
    startY: number,
    draggable: boolean,
    color: number
  ): void {
    let yOffset = startY;
    players.forEach((player, index) => {
      const isCol2 = index % 2 !== 0;
      const currentX = isCol2 ? startX + 90 : startX + 30;

      if (index > 0 && index % 2 === 0) {
        yOffset += 45;
      }

      const sprite = this.createDugoutPlayer(
        player,
        currentX,
        yOffset,
        color,
        draggable
      );
      this.dugoutSprites.set(player.id, sprite);
    });
  }

  private formationContainers: Map<string, Phaser.GameObjects.Container> =
    new Map();

  private createFormationUI(team: Team, x: number, y: number): void {
    const container = this.add.container(x, y);
    this.formationContainers.set(team.id, container);

    // Save Button
    const saveBtn = this.add.text(0, 0, "Save Setup", {
      fontSize: "12px",
      color: "#44ff44",
      backgroundColor: "#222",
    });
    saveBtn.setInteractive({ useHandCursor: true });
    saveBtn.on("pointerdown", () => this.saveFormation());
    container.add(saveBtn);

    // Default Button
    const defaultBtn = this.add.text(0, 25, "Default", {
      fontSize: "12px",
      color: "#ffff44",
      backgroundColor: "#222",
    });
    defaultBtn.setInteractive({ useHandCursor: true });
    defaultBtn.on("pointerdown", () => this.loadDefaultFormation());
    container.add(defaultBtn);

    // Load Button (if any saved)
    if (team.formations && team.formations.length > 0) {
      const loadBtn = this.add.text(60, 0, "Load", {
        fontSize: "12px",
        color: "#4444ff",
        backgroundColor: "#222",
      });
      loadBtn.setInteractive({ useHandCursor: true });
      loadBtn.on("pointerdown", () => this.loadFormation(team.formations[0]));
      container.add(loadBtn);
    }

    // Hide initially
    container.setVisible(false);
  }

  private saveFormation(): void {
    const positions: { playerId: string; x: number; y: number }[] = [];
    this.placedPlayers.forEach((playerId) => {
      const player = this.getPlayerById(playerId);
      if (player && player.gridPosition) {
        positions.push({
          playerId: player.id,
          x: player.gridPosition.x,
          y: player.gridPosition.y,
        });
      }
    });

    if (positions.length === 0) {
      alert("Place players first!");
      return;
    }

    const formation = { name: "Custom Setup", positions };
    // Overwrite existing for now or push
    this.currentSetupTeam.formations = [formation];
    alert("Setup Saved!");

    // Refresh UI to show Load button
    this.scene.restart({ team1: this.team1, team2: this.team2 }); // This resets everything though... maybe just refresh buttons?
    // For now, simple alert is enough.
  }

  private loadDefaultFormation(): void {
    // Clear current setup
    this.clearSetup();

    // Simple 3-4 setup
    // 3 on LOS (Line of Scrimmage)
    // 4 in Wide Zones / Backfield

    const isTeam1 = this.currentSetupTeam.id === this.team1.id;
    const losY = isTeam1 ? 5 : 11;
    const backY = isTeam1 ? 2 : 14;

    const players = this.currentSetupTeam.players.slice(0, 7);

    // Place 3 on LOS
    this.placePlayerAtGrid(players[0], 4, losY);
    this.placePlayerAtGrid(players[1], 5, losY);
    this.placePlayerAtGrid(players[2], 6, losY);

    // Place 4 others
    this.placePlayerAtGrid(players[3], 1, backY);
    this.placePlayerAtGrid(players[4], 9, backY);
    this.placePlayerAtGrid(players[5], 3, backY - (isTeam1 ? 1 : -1));
    this.placePlayerAtGrid(players[6], 7, backY - (isTeam1 ? 1 : -1));
  }

  private loadFormation(formation: any): void {
    this.clearSetup();
    formation.positions.forEach((pos: any) => {
      const player = this.getPlayerById(pos.playerId);
      if (player) {
        this.placePlayerAtGrid(player, pos.x, pos.y);
      }
    });
  }

  private clearSetup(): void {
    this.placedPlayers.forEach((playerId) => {
      const player = this.getPlayerById(playerId);
      if (player) {
        const sprite = this.dugoutSprites.get(playerId);
        if (sprite) {
          this.returnToDugout(sprite, player);
        }
      }
    });
    // Force immediate clear for logic (animations take time)
    this.placedPlayers.clear();
    this.updateConfirmButton();
  }

  private placePlayerAtGrid(player: Player, x: number, y: number): void {
    const sprite = this.dugoutSprites.get(player.id);
    if (sprite) {
      const pixelPos = this.pitch.getPixelPosition(x, y);
      sprite.x = pixelPos.x;
      sprite.y = pixelPos.y;
      player.gridPosition = { x, y };
      this.placedPlayers.add(player.id);
      this.updateConfirmButton();
    }
  }

  private createDugoutPlayer(
    player: Player,
    x: number,
    y: number,
    color: number,
    draggable: boolean
  ): Phaser.GameObjects.Container {
    // Use PlayerSprite for consistent visuals
    const sprite = new PlayerSprite(this, x, y, player, color);

    sprite.setData("originalX", x);
    sprite.setData("originalY", y);
    sprite.setData("playerId", player.id);

    // Make draggable
    sprite.setSize(32, 32);

    if (draggable) {
      sprite.setInteractive({ draggable: true, useHandCursor: true });
      this.input.setDraggable(sprite);
    } else {
      sprite.setInteractive({ useHandCursor: true }); // Just for hover info
    }

    sprite.on("dragstart", () => {
      sprite.setDepth(100);
    });

    sprite.on(
      "drag",
      (_pointer: Phaser.Input.Pointer, dragX: number, dragY: number) => {
        sprite.x = dragX;
        sprite.y = dragY;
      }
    );

    sprite.on("dragend", () => {
      sprite.setDepth(10);
      this.handlePlayerDrop(player, sprite);
    });

    return sprite;
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

      // Check pitch limit (max 7)
      // If player is already placed (just moving them), don't count against limit
      const isNewPlacement = !this.placedPlayers.has(player.id);
      if (isNewPlacement && this.placedPlayers.size >= 7) {
        // Reject
        this.returnToDugout(sprite, player);
        // Optional: Show warning text
        return;
      }

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
    // We now allow choosing ANY 7 players from the roster
    const placedCount = this.placedPlayers.size;

    // Max 7, or roster size if smaller
    const requiredCount = Math.min(7, this.currentSetupTeam.players.length);

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
