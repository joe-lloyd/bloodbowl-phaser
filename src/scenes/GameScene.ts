import Phaser from "phaser";
import { Pitch } from "../game/Pitch";
import { PlayerSprite } from "../game/PlayerSprite";
import { PlayerInfoPanel } from "../game/PlayerInfoPanel";
import { Team } from "../types/Team";
import { Player, PlayerStatus } from "../types/Player";
import { ServiceContainer } from "../services/ServiceContainer";
import { IGameService } from "../services/interfaces/IGameService";
import { IEventBus } from "../services/EventBus";
import { GamePhase } from "../types/GameState";
import { UIText, UIButton } from "../ui";

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
  private gameService!: IGameService;
  private eventBus!: IEventBus;
  private turnText!: UIText;
  private endTurnButton!: UIButton;
  private selectedPlayerId: string | null = null;

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

    // Get services
    const container = ServiceContainer.getInstance();
    this.gameService = container.gameService;
    this.eventBus = container.eventBus;
  }

  create(): void {
    const width = this.cameras.main.width;
    const height = this.cameras.main.height;

    // Background
    this.add
      .rectangle(0, 0, width, height, 0x0a0a1e)
      .setOrigin(0)
      .setName("background");

    // Team names and colors
    const team1Color = this.team1.colors.primary;
    const team2Color = this.team2.colors.primary;

    // Team 1 header (left side)
    this.add.rectangle(20, 20, 200, 60, team1Color, 0.3).setOrigin(0);
    UIText.createLabel(this, 30, 30, `${this.team1.name} (${this.team1.race})`);

    // Team 2 header (right side)
    this.add.rectangle(width - 220, 20, 200, 60, team2Color, 0.3).setOrigin(0);
    UIText.createLabel(
      this,
      width - 210,
      30,
      `${this.team2.name} (${this.team2.race})`
    );

    // Create pitch (horizontal: 20×11 grid, 60px cells = 1200×660px)
    const pitchWidth = 20 * 60; // 1200px
    const pitchHeight = 11 * 60; // 660px
    const pitchX = (width - pitchWidth) / 2;
    const pitchY = 150; // Space at top for dugout

    this.pitch = new Pitch(this, pitchX, pitchY);

    // Create dugouts (top and bottom)
    // Team 1 dugout: Above pitch
    this.createDugout(team1Color, pitchX, 20, this.team1, true);
    // Team 2 dugout: Below pitch
    this.createDugout(
      team2Color,
      pitchX,
      pitchY + pitchHeight + 20,
      this.team2,
      false
    );

    // Listen for state changes
    this.eventBus.on("phaseChanged", () => this.updateTurnUI());
    this.eventBus.on("turnEnded", () => this.updateTurnUI());

    this.eventBus.on("turnStarted", (turn: any) => {
      this.updateTurnUI();
      // Reset player activations visually
      this.playerSprites.forEach((sprite) => sprite.setAlpha(1));
      // Show notification
      const teamName =
        turn.teamId === this.team1.id ? this.team1.name : this.team2.name;
      this.showTurnNotification(`Turn ${turn.turnNumber}: ${teamName}`);
    });

    // Place players from setup
    this.placePlayersFromSetup();

    // UI - Turn Info
    this.turnText = new UIText(this, {
      x: width / 2,
      y: 30,
      text: "Turn 0",
      variant: "h4",
      fontStyle: "bold",
    });

    // UI - End Turn Button
    this.endTurnButton = new UIButton(this, {
      x: width - 100,
      y: height - 50,
      text: "END TURN",
      variant: "danger",
      onClick: () => this.gameService.endTurn(),
    });

    // Player info panel
    this.playerInfoPanel = new PlayerInfoPanel(this, width - 170, pitchY + 400);

    // Listen for player hover events
    this.events.on("showPlayerInfo", (player: Player) => {
      this.playerInfoPanel.showPlayer(player);
    });

    this.events.on("hidePlayerInfo", () => {
      this.playerInfoPanel.hide();
    });

    // Back button
    this.createBackButton();

    // Info text
    new UIText(this, {
      x: width / 2,
      y: height - 30,
      text: `Game Started! ${this.kickingTeam.name} kicks to ${this.receivingTeam.name}`,
      variant: "small",
      color: "#888888",
    });

    // Background click to deselect
    const bg = this.children.getByName("background");
    if (bg) {
      bg.setInteractive();
      bg.on("pointerdown", () => this.deselectPlayer());
    }

    // Start Game
    this.gameService.startGame(this.kickingTeam.id);
  }

  private showTurnNotification(message: string): void {
    const text = this.add
      .text(
        this.cameras.main.width / 2,
        this.cameras.main.height / 2,
        message,
        {
          fontSize: "48px",
          color: "#ffff00",
          stroke: "#000000",
          strokeThickness: 4,
        }
      )
      .setOrigin(0.5)
      .setDepth(1000);

    this.tweens.add({
      targets: text,
      alpha: 0,
      y: text.y - 50,
      duration: 2000,
      delay: 1000,
      onComplete: () => text.destroy(),
    });
  }

  private updateTurnUI(): void {
    const state = this.gameService.getState();
    const activeTeam =
      state.activeTeamId === this.team1.id ? this.team1 : this.team2;
    this.turnText.setText(`Turn ${state.turn.turnNumber}: ${activeTeam.name}`);
    this.turnText.setColor(
      activeTeam.colors.primary === 0xff4444 ? "#ff4444" : "#4444ff"
    );

    // Update End Turn button visibility/color based on active team
    this.endTurnButton.setVisible(state.phase === GamePhase.PLAY);
  }

  private selectPlayer(playerId: string): void {
    const state = this.gameService.getState();
    const player = this.getPlayerById(playerId);

    if (!player) return;

    // Only allow selection if it's this team's turn
    if (state.activeTeamId !== player.teamId) {
      // Maybe show "Not your turn" warning
      console.log("Not your turn!");
      return;
    }

    // Deselect previous
    if (this.selectedPlayerId) {
      const prevSprite = this.playerSprites.get(this.selectedPlayerId);
      if (prevSprite) {
        prevSprite.unhighlight();
      }
    }

    this.selectedPlayerId = playerId;

    // Highlight new
    const newSprite = this.playerSprites.get(playerId);
    if (newSprite) {
      newSprite.highlight(0xffff00);
    }
  }

  private getPlayerById(playerId: string): Player | undefined {
    // Search both teams
    return (
      this.team1.players.find((p) => p.id === playerId) ||
      this.team2.players.find((p) => p.id === playerId)
    );
  }

  private deselectPlayer(): void {
    if (this.selectedPlayerId) {
      const prevSprite = this.playerSprites.get(this.selectedPlayerId);
      if (prevSprite) {
        prevSprite.unhighlight();
      }
      this.selectedPlayerId = null;
    }
  }

  private createDugout(
    color: number,
    x: number,
    y: number,
    team: Team,
    _isLeft: boolean
  ): void {
    // Dugout Backgrounds
    // Reserves (Top) - Height 400
    this.add.rectangle(x, y, 120, 400, 0x1a1a2e, 0.8).setOrigin(0);
    this.add.rectangle(x, y, 120, 400, color, 0.2).setOrigin(0);
    UIText.createLabel(this, x + 10, y + 10, "RESERVES");

    // KO (Middle) - Height 120
    const koY = y + 410;
    this.add.rectangle(x, koY, 120, 120, 0x1a1a2e, 0.8).setOrigin(0);
    this.add.rectangle(x, koY, 120, 120, 0xffaa00, 0.1).setOrigin(0);
    UIText.createLabel(this, x + 10, koY + 5, "KO", "#ffa");

    // Dead/Injured (Bottom) - Height 120
    const deadY = koY + 130;
    this.add.rectangle(x, deadY, 120, 120, 0x1a1a2e, 0.8).setOrigin(0);
    this.add.rectangle(x, deadY, 120, 120, 0xff0000, 0.1).setOrigin(0);
    UIText.createLabel(this, x + 10, deadY + 5, "DEAD & INJURED", "#f88");

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

    // Render Groups
    this.renderPlayerGroup(reserves, x, y + 30, color);
    this.renderPlayerGroup(koPlayers, x, koY + 25, color);
    this.renderPlayerGroup(deadPlayers, x, deadY + 25, color);
  }

  private renderPlayerGroup(
    players: Player[],
    startX: number,
    startY: number,
    color: number
  ): void {
    let yOffset = startY;
    players.forEach((player, index) => {
      const isCol2 = index % 2 !== 0;
      const currentX = isCol2 ? startX + 90 : startX + 30;

      if (index > 0 && index % 2 === 0) {
        yOffset += 45;
      }
      this.createDugoutPlayerDisplay(player, currentX, yOffset, color);
    });
  }

  private createDugoutPlayerDisplay(
    player: Player,
    x: number,
    y: number,
    teamColor: number
  ): Phaser.GameObjects.Container {
    // Use PlayerSprite for consistent visuals
    const sprite = new PlayerSprite(this, x, y, player, teamColor);
    sprite.setSize(32, 32);
    sprite.setInteractive({ useHandCursor: true });

    sprite.on("pointerover", () => {
      this.events.emit("showPlayerInfo", player);
    });

    sprite.on("pointerout", () => {
      this.events.emit("hidePlayerInfo");
    });

    return sprite;
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

    // Interaction
    sprite.setInteractive({ useHandCursor: true });
    sprite.on("pointerover", () => {
      this.events.emit("showPlayerInfo", player);
    });
    sprite.on("pointerout", () => {
      this.events.emit("hidePlayerInfo");
    });
    sprite.on("pointerdown", () => {
      this.selectPlayer(player.id);
    });
  }

  private createBackButton(): void {
    new UIButton(this, {
      x: 20,
      y: 20,
      text: "← Back",
      variant: "danger",
      fontSize: "18px",
      onClick: () => this.scene.start("TeamSelectionScene"),
      origin: { x: 0, y: 0 },
    });
  }
}
