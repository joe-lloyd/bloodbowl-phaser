import Phaser from "phaser";
import { Team } from "../types/Team";
import { Player } from "../types/Player";
import { Pitch } from "../game/Pitch";
import { PlayerSprite } from "../game/PlayerSprite";
import { PlayerInfoPanel } from "../game/PlayerInfoPanel";
import { pixelToGrid } from "../utils/GridUtils";
import { GameStateManager } from "../game/GameStateManager";
import { UIText, UIButton, UIOverlay } from "../ui";
import {
  SetupValidator,
  FormationManager,
  CoinFlipController,
  PlayerPlacementController,
  SetupUIController,
} from "../game/setup";
import { SetupPhase } from "../types/SetupTypes";

/**
 * Setup Scene - Refactored to use testable controllers
 * Handles coin flip, player placement, and formation management
 */
export class SetupScene extends Phaser.Scene {
  // Teams
  private team1!: Team;
  private team2!: Team;
  private kickingTeam!: Team;
  private receivingTeam!: Team;
  private currentSetupTeam!: Team;

  // Game objects
  private pitch!: Pitch;
  private dugoutSprites: Map<string, Phaser.GameObjects.Container> = new Map();
  private playerInfoPanel!: PlayerInfoPanel;

  // Controllers
  private validator!: SetupValidator;
  private formationManager!: FormationManager;
  private coinFlipController!: CoinFlipController;
  private placementController!: PlayerPlacementController;
  private uiController!: SetupUIController;

  // State
  private setupPhase: SetupPhase = "coinflip";
  private gameStateManager!: GameStateManager;
  private formationContainers: Map<string, Phaser.GameObjects.Container> =
    new Map();

  constructor() {
    super({ key: "SetupScene" });
  }

  init(data: { team1: Team; team2: Team }): void {
    this.team1 = data.team1;
    this.team2 = data.team2;
    this.dugoutSprites.clear();
    this.formationContainers.clear();
    this.setupPhase = "coinflip";

    // Initialize controllers
    this.validator = new SetupValidator();
    this.formationManager = new FormationManager();
    this.gameStateManager = new GameStateManager(this.team1, this.team2);
  }

  create(): void {
    const width = this.cameras.main.width;
    const height = this.cameras.main.height;

    // Background
    const bg = this.add.rectangle(0, 0, width, height, 0x0a0a1e).setOrigin(0);
    bg.setInteractive();
    bg.on("pointerdown", () => {
      this.placementController?.deselectPlayer();
    });

    // Create pitch FIRST (before UI controller needs it)
    const pitchWidth = 20 * 60; // 1200px
    const pitchHeight = 11 * 60; // 660px
    const pitchX = (width - pitchWidth) / 2;
    // Temporary Y, will be adjusted after getting layout
    const tempPitchY = 330;

    this.pitch = new Pitch(this, pitchX, tempPitchY);

    // NOW create UI controller (it needs pitch to exist)
    this.uiController = new SetupUIController(this, this.pitch);
    const layout = this.uiController.getLayout();

    // Adjust pitch position based on layout
    const pitchY = layout.pitchStartY;
    this.pitch.getContainer().y = pitchY;

    // Create dugouts (adjusted positions)
    this.createDugout(this.team1, pitchX, layout.dugoutStartY, true);
    // Bottom dugout: Pitch Y + Pitch Height + Gap
    this.createDugout(this.team2, pitchX, pitchY + pitchHeight + 10, false);

    // Create UI
    this.uiController.createUI(width, () => this.confirmSetup());

    // Create placement controller
    this.placementController = new PlayerPlacementController(
      this,
      this.pitch,
      this.validator
    );

    // Wire up placement controller events
    this.setupPlacementEvents();

    // Setup pitch click-to-place
    this.setupPitchInteraction();

    // Player Info Panel
    this.playerInfoPanel = new PlayerInfoPanel(this, width - 220, height - 150);

    // Start coin flip
    this.startCoinFlip();

    // Listen to game state manager events for kickoff
    this.setupGameStateEvents();
  }

  private startCoinFlip(): void {
    this.coinFlipController = new CoinFlipController(this);

    this.coinFlipController.on(
      "coinFlipComplete",
      ({
        kickingTeam,
        receivingTeam,
      }: {
        kickingTeam: Team;
        receivingTeam: Team;
      }) => {
        this.kickingTeam = kickingTeam;
        this.receivingTeam = receivingTeam;
        this.startSetup();
      }
    );

    this.coinFlipController.show(this.team1, this.team2);
  }

  private startSetup(): void {
    // Start with kicking team
    this.currentSetupTeam = this.kickingTeam;
    this.setupPhase = "kicking";
    this.updateSetupState();
  }

  private updateSetupState(): void {
    const isTeam1 = this.currentSetupTeam.id === this.team1.id;

    // Update UI
    this.uiController.updateForPhase(this.setupPhase, this.currentSetupTeam);
    this.uiController.highlightSetupZone(isTeam1);

    // Enable placement for current team
    this.placementController.enablePlacement(
      this.currentSetupTeam,
      isTeam1,
      this.dugoutSprites
    );

    // Update formation UI visibility
    this.formationContainers.forEach((container, teamId) => {
      container.setVisible(teamId === this.currentSetupTeam.id);
    });

    // Update confirm button
    this.updateConfirmButton();
  }

  private setupPlacementEvents(): void {
    this.placementController.on(
      "playerPlaced",
      ({ playerId, x, y }: { playerId: string; x: number; y: number }) => {
        const sprite = this.dugoutSprites.get(playerId);
        if (sprite) {
          const pixelPos = this.pitch.getPixelPosition(x, y);
          sprite.x = pixelPos.x;
          sprite.y = pixelPos.y;
          sprite.setDepth(10);
        }
        this.updateConfirmButton();
      }
    );

    this.placementController.on("playerRemoved", (playerId: string) => {
      const sprite = this.dugoutSprites.get(playerId);
      const player = this.getPlayerById(playerId);
      if (sprite && player) {
        // Return to dugout
        const originalX = sprite.getData("originalX");
        const originalY = sprite.getData("originalY");
        sprite.x = originalX;
        sprite.y = originalY;
        sprite.setDepth(1);
      }
      this.updateConfirmButton();
    });

    this.placementController.on("playerSelected", (playerId: string) => {
      const sprite = this.dugoutSprites.get(playerId);
      if (sprite instanceof PlayerSprite) {
        sprite.highlight(0xffff00);
      }
    });

    this.placementController.on("playerDeselected", (playerId: string) => {
      const sprite = this.dugoutSprites.get(playerId);
      if (sprite instanceof PlayerSprite) {
        sprite.unhighlight();
      }
    });

    this.placementController.on(
      "placementInvalid",
      ({ reason }: { reason: string }) => {
        console.log("Invalid placement:", reason);
        // Could show error message to user
      }
    );
  }

  private setupPitchInteraction(): void {
    const pitchContainer = this.pitch.getContainer();

    // Set size on container before making it interactive
    pitchContainer.setSize(1200, 660);
    pitchContainer.setInteractive();

    pitchContainer.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      const selectedPlayerId = this.placementController.getSelectedPlayerId();
      if (selectedPlayerId) {
        const localX = pointer.x - this.pitch.getContainer().x;
        const localY = pointer.y - this.pitch.getContainer().y;
        const gridPos = pixelToGrid(localX, localY, 40);

        this.placementController.placePlayer(
          selectedPlayerId,
          gridPos.x,
          gridPos.y
        );
      }
    });
  }

  private updateConfirmButton(): void {
    const placedCount = this.placementController.getPlacedCount();
    const availablePlayers = this.currentSetupTeam.players.filter(
      (p) => p.status === "Active" || !p.status
    );
    const availableCount = availablePlayers.length - placedCount;

    const canConfirm = this.validator.canConfirmSetup(
      placedCount,
      availableCount
    );
    this.uiController.showConfirmButton(canConfirm);
  }

  private confirmSetup(): void {
    if (this.setupPhase === "kicking") {
      // Move to receiving team setup
      this.currentSetupTeam = this.receivingTeam;
      this.setupPhase = "receiving";
      // Don't clear placements - first team's players should stay on pitch!
      // Just reset the placement controller's internal state for the new team
      this.updateSetupState();
    } else if (this.setupPhase === "receiving") {
      // Setup complete, proceed to kickoff
      this.setupPhase = "complete";
      this.uiController.showConfirmButton(false);
      this.proceedToKickoff();
    }
  }

  private proceedToKickoff(): void {
    // Transition to game
    this.gameStateManager.startGame(this.kickingTeam.id);
  }

  private setupGameStateEvents(): void {
    this.gameStateManager.on("kickoffStarted", () => {
      this.uiController.updateInstructions("KICKOFF!");
    });

    this.gameStateManager.on(
      "kickoffResult",
      (data: { roll: number; event: string }) => {
        this.showKickoffResult(data.event);
      }
    );

    this.gameStateManager.on("readyToStart", () => {
      this.scene.start("GameScene", {
        team1: this.team1,
        team2: this.team2,
        kickingTeam: this.kickingTeam,
        receivingTeam: this.receivingTeam,
        gameStateManager: this.gameStateManager,
      });
    });
  }

  private showKickoffResult(event: string): void {
    const width = this.cameras.main.width;
    const height = this.cameras.main.height;

    const overlay = new UIOverlay(this, { width, height });
    const text = new UIText(this, {
      x: width / 2,
      y: height / 2,
      text: `KICKOFF EVENT:\\n${event}`,
      variant: "h1",
      color: "#ffff00",
      align: "center",
    });
    overlay.addElement(text);
  }

  // Dugout creation
  private createDugout(
    team: Team,
    x: number,
    y: number,
    _isLeft: boolean
  ): void {
    const dugoutWidth = 1200;
    const dugoutHeight = 120;

    // Background
    this.add
      .rectangle(x, y, dugoutWidth, dugoutHeight, 0x1a1a2e, 0.8)
      .setOrigin(0);
    this.add
      .rectangle(x, y, dugoutWidth, dugoutHeight, team.colors.primary, 0.2)
      .setOrigin(0);

    // Team Name
    UIText.createLabel(this, x + 10, y + 5, `${team.name}`);

    // Filter players
    const reserves = team.players.filter(
      (p) =>
        !p.gridPosition &&
        p.status !== "KO" &&
        p.status !== "Injured" &&
        p.status !== "Dead"
    );

    // Render players
    this.renderPlayerGroupHorizontal(
      reserves,
      x + 10,
      y + 45,
      true,
      team.colors.primary,
      1100
    );

    // Formation buttons
    this.createFormationUI(team, x + dugoutWidth - 150, y + 5);
  }

  private renderPlayerGroupHorizontal(
    players: Player[],
    startX: number,
    startY: number,
    draggable: boolean,
    color: number,
    maxWidth: number
  ): void {
    const playerSize = 35;
    const spacing = 5;
    const playersPerRow = Math.floor(maxWidth / (playerSize + spacing));

    players.forEach((player, index) => {
      const col = index % playersPerRow;
      const row = Math.floor(index / playersPerRow);

      const currentX = startX + col * (playerSize + spacing);
      const currentY = startY + row * (playerSize + spacing);

      const sprite = this.createDugoutPlayer(
        player,
        currentX,
        currentY,
        color,
        draggable
      );
      this.dugoutSprites.set(player.id, sprite);
    });
  }

  private createDugoutPlayer(
    player: Player,
    x: number,
    y: number,
    color: number,
    draggable: boolean
  ): Phaser.GameObjects.Container {
    const sprite = new PlayerSprite(this, x, y, player, color);

    sprite.setData("originalX", x);
    sprite.setData("originalY", y);
    sprite.setData("playerId", player.id);
    sprite.setSize(32, 32);

    if (draggable) {
      sprite.setInteractive({ draggable: true, useHandCursor: true });
      this.input.setDraggable(sprite);
    } else {
      sprite.setInteractive({ useHandCursor: true });
    }

    // Drag events
    sprite.on("dragstart", () => {
      sprite.setDepth(100);
      this.placementController.selectPlayer(player.id);
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

    // Hover & Click
    sprite.on("pointerover", () => {
      this.playerInfoPanel.showPlayer(player);
    });

    sprite.on("pointerout", () => {
      this.playerInfoPanel.hide();
    });

    sprite.on("pointerdown", () => {
      this.placementController.selectPlayer(player.id);
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

    const success = this.placementController.placePlayer(
      player.id,
      gridPos.x,
      gridPos.y
    );

    if (!success) {
      // Return to original position
      const originalX = sprite.getData("originalX");
      const originalY = sprite.getData("originalY");
      sprite.x = originalX;
      sprite.y = originalY;
    }
  }

  // Formation UI
  private createFormationUI(team: Team, x: number, y: number): void {
    const container = this.add.container(x, y);
    this.formationContainers.set(team.id, container);

    const buttons = [
      {
        text: "Save",
        y: 0,
        color: "#44ff44",
        onClick: () => this.saveFormation(),
      },
      {
        text: "Default",
        y: 20,
        color: "#ffff44",
        onClick: () => this.loadDefaultFormation(),
      },
      {
        text: "Load",
        y: 40,
        color: "#4444ff",
        onClick: () => this.loadFormation(),
      },
      {
        text: "Clear",
        y: 60,
        color: "#ff4444",
        onClick: () => this.clearSetup(),
      },
    ];

    buttons.forEach(({ text, y: btnY, color, onClick }) => {
      const btn = new UIButton(this, {
        x: 0,
        y: btnY,
        text,
        variant: "small",
        fontSize: "11px",
        onClick,
        origin: { x: 0, y: 0 },
      });
      btn.setStyle({ color });
      container.add(btn);
    });

    container.setVisible(false);
  }

  private saveFormation(): void {
    const positions = this.placementController.getPlacements();
    if (positions.length === 0) {
      alert("Place players first!");
      return;
    }

    this.formationManager.saveFormation(
      this.currentSetupTeam.id,
      positions,
      "Custom Setup"
    );
    alert("Setup Saved!");
  }

  private loadDefaultFormation(): void {
    this.placementController.clearPlacements();
    const isTeam1 = this.currentSetupTeam.id === this.team1.id;
    const formation = this.formationManager.getDefaultFormation(isTeam1);
    this.placementController.loadFormation(formation);
  }

  private loadFormation(): void {
    const formations = this.formationManager.listFormations(
      this.currentSetupTeam.id
    );
    if (formations.length === 0) {
      alert("No saved formations!");
      return;
    }

    const formation = this.formationManager.loadFormation(
      this.currentSetupTeam.id,
      formations[0]
    );
    if (formation) {
      this.placementController.clearPlacements();
      this.placementController.loadFormation(formation);
    }
  }

  private clearSetup(): void {
    this.placementController.clearPlacements();
  }

  // Helper methods
  private getPlayerById(playerId: string): Player | undefined {
    return (
      this.team1.players.find((p) => p.id === playerId) ||
      this.team2.players.find((p) => p.id === playerId)
    );
  }
}
