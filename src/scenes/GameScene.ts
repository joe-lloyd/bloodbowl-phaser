import Phaser from "phaser";
import { Pitch } from "../game/Pitch";
import { PlayerSprite } from "../game/PlayerSprite";
import { PlayerInfoPanel } from "../game/PlayerInfoPanel";
import { DiceLog } from "../game/ui/DiceLog";
import { Dugout } from "../game/Dugout";
import { Team } from "../types/Team";
import { Player, PlayerStatus } from "../types/Player";
import { ServiceContainer } from "../services/ServiceContainer";
import { IGameService } from "../services/interfaces/IGameService";
import { IEventBus } from "../services/EventBus";
import { GamePhase } from "../types/GameState";
import { UIText, UIButton } from "../ui";
import {
  SetupValidator,
  FormationManager,
  CoinFlipController,
  PlayerPlacementController,
  SetupUIController,
} from "../game/setup";
import { pixelToGrid } from "../utils/GridUtils";
import { MovementValidator } from "../domain/validators/MovementValidator";
import { GameplayInteractionController } from "../game/controllers/GameplayInteractionController";

/**
 * Game Scene - Unified scene for Setup and Gameplay
 */
export class GameScene extends Phaser.Scene {
  private pitch!: Pitch;
  private team1!: Team;
  private team2!: Team;
  private kickingTeam!: Team;
  private receivingTeam!: Team;

  // UI Components
  private playerInfoPanel!: PlayerInfoPanel;
  private diceLog!: DiceLog;
  private turnText!: UIText;
  private endTurnButton!: UIButton;
  private dugouts: Map<string, Dugout> = new Map();

  // Controllers (Setup Phase)
  private validator!: SetupValidator;
  private formationManager!: FormationManager;
  private coinFlipController!: CoinFlipController;
  private placementController!: PlayerPlacementController;
  private setupUIController!: SetupUIController;

  // Logic
  private movementValidator!: MovementValidator;
  private gameplayController!: GameplayInteractionController;

  // Services
  private gameService!: IGameService;
  private eventBus!: IEventBus;

  // State
  private playerSprites: Map<string, PlayerSprite> = new Map();
  private selectedPlayerId: string | null = null;
  private isSetupActive: boolean = false;
  private kickoffStep: 'SELECT_KICKER' | 'SELECT_TARGET' | null = null;
  private pendingKickoffData: any = null;
  private ballSprite: Phaser.GameObjects.Shape | null = null;

  constructor() {
    super({ key: "GameScene" });
  }

  init(data: { team1: Team; team2: Team }): void {
    this.team1 = data.team1;
    this.team2 = data.team2;

    // Default kicking/receiving (will be set by coinflip)
    this.kickingTeam = this.team1;
    this.receivingTeam = this.team2;

    const container = ServiceContainer.getInstance();
    this.gameService = container.gameService;
    this.eventBus = container.eventBus;
  }

  create(): void {
    const width = this.cameras.main.width;
    const height = this.cameras.main.height;

    // 1. Background (Interactive for deselect)
    this.add.rectangle(0, 0, width, height, 0x0a0a1e).setOrigin(0).setInteractive().on('pointerdown', () => this.onBackgroundClick());

    // 2. Initialize Core Game Objects
    // Pitch centered
    const pitchX = (width - 1200) / 2;
    const pitchY = 180; // Leaving room for top dugout
    this.pitch = new Pitch(this, pitchX, pitchY);

    // Pitch interaction for Play Phase
    // Pitch interaction
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (this.isSetupActive) return; // Setup handled by PlacementController (managed internally or separate)

      // Delegate to Gameplay Controller
      this.gameplayController.handlePointerDown(pointer, this.isSetupActive);
    });

    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      // Delegate
      this.gameplayController.handlePointerMove(pointer, this.isSetupActive);
    });

    // 3. Initialize Dugouts (Top and Bottom)
    this.createDugouts(pitchX, pitchY);



    // 4. Initialize UI Overlay
    this.initializeUI(width, height);

    // 4. Initialize UI Overlay
    this.initializeUI(width, height);

    // 5. Initialize Controllers
    this.initializeControllers();
    this.movementValidator = new MovementValidator();

    // Gameplay Controller
    this.gameplayController = new GameplayInteractionController(
      this,
      this.gameService,
      this.pitch,
      this.movementValidator,
      this.playerInfoPanel
    );

    // 6. Setup Event Listeners
    this.setupEventListeners();

    // 7. Start Logic based on Phase
    const state = this.gameService.getState();
    if (state.phase === GamePhase.SETUP) {
      this.startSetupPhase();
    } else {
      this.startPlayPhase();
    }
  }

  private createDugouts(pitchX: number, pitchY: number): void {
    // Top Dugout (Team 1)
    const topDugout = new Dugout(this, pitchX, 20, this.team1);
    this.dugouts.set(this.team1.id, topDugout);

    // Bottom Dugout (Team 2)
    const bottomDugout = new Dugout(this, pitchX, pitchY + 660 + 20, this.team2); // Pitch height is ~900 (15x60)
    this.dugouts.set(this.team2.id, bottomDugout);

    // Wire up drags
    [topDugout, bottomDugout].forEach(d => {
      d.setDragCallbacks(
        (id) => this.onDugoutDragStart(id),
        (id, x, y) => this.onDugoutDragEnd(id, x, y)
      );
    });
  }

  private initializeUI(width: number, height: number): void {
    // Turn Info (Top Center)
    this.turnText = new UIText(this, {
      x: width / 2,
      y: 15,
      text: "",
      variant: "h4",
      fontStyle: "bold"
    });

    // End Turn Button
    this.endTurnButton = new UIButton(this, {
      x: width - 120,
      y: height - 60,
      text: "END TURN",
      variant: "danger",
      onClick: () => this.gameService.endTurn()
    });
    this.endTurnButton.setVisible(false);

    // Player Info Panel
    this.playerInfoPanel = new PlayerInfoPanel(this, width - 220, height - 300);

    // Dice Log
    this.diceLog = new DiceLog(this, 10, height - 350);
  }

  private initializeControllers(): void {
    this.validator = new SetupValidator();
    this.formationManager = new FormationManager();
    this.setupUIController = new SetupUIController(this, this.pitch, this.gameService);
    this.placementController = new PlayerPlacementController(this, this.pitch, this.validator);

    // Coinflip
    this.coinFlipController = new CoinFlipController(this);
    this.coinFlipController.on("coinFlipComplete", ({ kickingTeam, receivingTeam }: { kickingTeam: Team, receivingTeam: Team }) => {
      this.kickingTeam = kickingTeam;
      this.receivingTeam = receivingTeam;

      // Update Game Service
      this.gameService.startSetup(kickingTeam.id);

      // Proceed to placement
      this.startPlacement("kicking");
    });
  }

  private startSetupPhase(): void {
    this.isSetupActive = true;
    this.endTurnButton.setVisible(false);
    this.coinFlipController.show(this.team1, this.team2);
  }

  private startPlacement(phase: "kicking" | "receiving"): void {
    const activeTeam = phase === "kicking" ? this.kickingTeam : this.receivingTeam;
    const isTeam1 = activeTeam.id === this.team1.id;

    this.setupUIController.createUI(this.cameras.main.width, {
      onConfirm: () => this.confirmSetupStep(phase),
      onDefault: () => {
        const formation = this.formationManager.getDefaultFormation(isTeam1);
        this.placementController.loadFormation(formation);
        this.refreshDugouts();
      },
      onSave: () => {
        const placements = this.placementController.getPlacements();
        if (placements.length > 0) {
          this.formationManager.saveFormation(activeTeam.id, placements, "Custom");
          this.showTurnNotification("Formation Saved!");
        }
      },
      onLoad: () => {
        const formation = this.formationManager.loadFormation(activeTeam.id, "Custom");
        if (formation) {
          this.placementController.loadFormation(formation);
          this.refreshDugouts();
        } else {
          this.showTurnNotification("No Saved Formation");
        }
      },
      onClear: () => {
        this.placementController.clearPlacements();
        this.refreshDugouts();
      }
    });
    this.setupUIController.updateForPhase(phase, activeTeam);
    this.setupUIController.highlightSetupZone();

    // Enable placement
    const dugout = this.dugouts.get(activeTeam.id);
    const sprites = dugout ? dugout.getSprites() : new Map();
    this.placementController.enablePlacement(activeTeam, isTeam1, sprites);
  }

  private confirmSetupStep(phase: "kicking" | "receiving"): void {
    this.setupUIController.clearHighlights();

    if (phase === "kicking") {
      // Switch active team for setup
      this.gameService.startSetup(this.receivingTeam.id);
      this.startPlacement("receiving");
    } else {
      // Finish setup
      this.gameService.startKickoff();
    }
  }

  // Event Listeners
  private setupEventListeners(): void {
    this.eventBus.on("phaseChanged", (data: { phase: GamePhase }) => {
      const { phase } = data;
      if (phase === GamePhase.PLAY) {
        this.startPlayPhase();
      } else if (phase === GamePhase.KICKOFF) {
        this.startKickoffPhase();
      }
    });

    this.eventBus.on("turnStarted", (turn: any) => {
      this.updateTurnUI();
      this.refreshDugouts();
      this.showTurnNotification(`Turn ${turn.turnNumber}`);
    });

    this.eventBus.on("turnEnded", () => this.updateTurnUI());

    // Listen for placement changes to update game state and dugouts
    this.placementController.on("playerPlaced", (data: { playerId: string, x: number, y: number }) => {
      this.gameService.placePlayer(data.playerId, data.x, data.y);
      this.refreshDugouts();
      this.checkSetupCompleteness();
    });

    this.placementController.on("playerRemoved", (playerId: string) => {
      this.gameService.removePlayer(playerId);
      this.refreshDugouts();
      this.checkSetupCompleteness();
    });

    // Gameplay events - Handled by Service events or refresh
    this.eventBus.on("playerMoved", (data: { playerId: string, from: any, to: any, path?: any[] }) => {
      // Animate movement if path provided
      if (data.path && data.path.length > 0) {
        const sprite = this.playerSprites.get(data.playerId);
        if (sprite) {
          // Convert grid path to pixel path
          const pixelPath = data.path.map(step => this.pitch.getPixelPosition(step.x, step.y));
          sprite.animateMovement(pixelPath).then(() => {
            this.refreshDugouts(); // Sync state after animation (or keep safe)
            this.checkSetupCompleteness();
          });
        } else {
          this.refreshDugouts();
        }
      } else {
        this.refreshDugouts(); // This updates sprite positions instantly
      }
      this.pitch.clearPath(); // Clear dots
      this.pitch.clearHighlights();
    });

    this.eventBus.on("kickoffStarted", () => {
      this.showTurnNotification("KICKOFF!");
    });

    this.eventBus.on("ballKicked", (data: any) => {
      // 1. Show Ball at Target immediately
      this.placeBallVisual(data.targetX, data.targetY);

      // Store scatter data for later animation
      this.pendingKickoffData = data;
    });

    this.eventBus.on("kickoffResult", (data: { roll: number, event: string }) => {
      // 2. Show Roll
      this.showTurnNotification(`${data.roll}: ${data.event}`);
      this.diceLog.addLog(`Kickoff Table: ${data.roll} (${data.event})`);

      // 3. Animate Scatter (after delay or immediately)
      if (this.pendingKickoffData) {
        this.animateBallScatter(this.pendingKickoffData);
        this.pendingKickoffData = null;
      }
    });

    this.eventBus.on("readyToStart", () => {
      this.gameService.startGame(this.kickingTeam.id);
    });
  }

  private refreshDugouts(): void {
    this.dugouts.forEach(d => d.refresh());
    this.placePlayersOnPitch();
  }

  private startPlayPhase(): void {
    this.isSetupActive = false;
    this.kickoffStep = null;
    this.setupUIController.destroy(); // Remove setup UI
    this.pitch.clearHighlights(); // Clear setup zones
    this.endTurnButton.setVisible(true);

    // Ensure all players are placed
    this.placePlayersOnPitch();

    // Update basic UI
    this.updateTurnUI();
  }

  private startKickoffPhase(): void {
    this.isSetupActive = false;
    this.kickoffStep = 'SELECT_KICKER';
    this.setupUIController.destroy();
    this.pitch.clearHighlights();
    this.endTurnButton.setVisible(false);

    // Ensure players are visible and correct
    this.placePlayersOnPitch();

    this.showTurnNotification("Select Kicker");
  }

  private placePlayersOnPitch(): void {
    // Get all players that have a grid position
    const allPlayers = [...this.team1.players.filter(p => p.gridPosition), ...this.team2.players.filter(p => p.gridPosition)];

    allPlayers.forEach(player => {
      const pos = this.pitch.getPixelPosition(player.gridPosition!.x, player.gridPosition!.y);

      if (this.playerSprites.has(player.id)) {
        const sprite = this.playerSprites.get(player.id)!;
        sprite.setPosition(pos.x, pos.y);
        sprite.setVisible(true);
        sprite.setDepth(10);
      } else {
        const teamColor = player.teamId === this.team1.id ? this.team1.colors.primary : this.team2.colors.primary;
        const sprite = new PlayerSprite(this, pos.x, pos.y, player, teamColor);
        sprite.setDepth(10);
        this.playerSprites.set(player.id, sprite);

        // Add interactivity for Play phase (setup phase uses placementController)
        sprite.setInteractive({ useHandCursor: true });
        sprite.on('pointerdown', () => this.onPlayerClick(player));
        sprite.on('pointerover', () => this.events.emit("showPlayerInfo", player));
        sprite.on('pointerout', () => this.events.emit("hidePlayerInfo"));
      }
    });

    // Hide any players that are in dugouts but still have visible pitch sprites
    // (This handles moving from pitch back to dugout)
    [...this.team1.players, ...this.team2.players].forEach(player => {
      if (!player.gridPosition && this.playerSprites.has(player.id)) {
        this.playerSprites.get(player.id)!.setVisible(false);
      }
    });

    this.checkSetupCompleteness();
  }

  private checkSetupCompleteness(): void {
    if (!this.isSetupActive) return;

    const state = this.gameService.getState();
    if (!state.activeTeamId) return;

    const isComplete = this.gameService.isSetupComplete(state.activeTeamId);
    this.setupUIController.showConfirmButton(isComplete);
  }

  private updateTurnUI(): void {
    const state = this.gameService.getState();
    const activeTeam = (state.activeTeamId === this.team1.id) ? this.team1 : this.team2;
    this.turnText.setText(`Turn ${state.turn.turnNumber}: ${activeTeam.name}`);
    this.turnText.setColor(activeTeam.colors.primary === 0xff4444 ? "#ff4444" : "#4444ff");
  }

  private showTurnNotification(message: string): void {
    const text = this.add.text(
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


  // Interactivity
  private onBackgroundClick(): void {
    if (this.isSetupActive) {
      this.placementController?.deselectPlayer();
    } else {
      this.deselectPlayer();
    }
    this.pitch.clearHighlights();
  }

  private deselectPlayer(): void {
    if (this.selectedPlayerId) {
      const sprite = this.playerSprites.get(this.selectedPlayerId);
      if (sprite) sprite.unhighlight();
      this.selectedPlayerId = null;
    }
    this.pitch.clearHighlights();
  }

  private onDugoutDragStart(playerId: string): void {
    if (this.isSetupActive) {
      this.placementController.selectPlayer(playerId);
    }
  }

  private onDugoutDragEnd(playerId: string, x: number, y: number): void {
    // If we are in setup, check if dropped on pitch
    if (this.isSetupActive) {
      const pitchContainer = this.pitch.getContainer();
      const localX = x - pitchContainer.x;
      const localY = y - pitchContainer.y;
      const gridPos = pixelToGrid(localX, localY, 60);

      this.placementController.placePlayer(playerId, gridPos.x, gridPos.y);
    }
  }

  private onPlayerClick(player: Player): void {
    if (this.isSetupActive) return;
    this.gameplayController.selectPlayer(player.id);
  }

  private placeBallVisual(x: number, y: number): void {
    if (this.ballSprite) this.ballSprite.destroy();

    const pos = this.pitch.getPixelPosition(x, y);
    // Use local coordinates for pitch container? 
    // pitch.getPixelPosition returns WORLD coords currently? 
    // Let's check pitch.ts... 
    // Pitch.getPixelPosition adds offsetX/Y so it is WORLD.
    // Pitch.add expects LOCAL?
    // Wait, Pitch.ts `container.add(child)`. if child is at WORLD coords, it will be offset AGAIN by container x,y.
    // So we must use LOCAL coords if adding to container.
    // BUT `getPixelPosition` returns WORLD.
    // So we should NOT add to pitch container if using getPixelPosition, OR convert.
    // Easiest: Add to Scene directly (above pitch).

    this.ballSprite = this.add.circle(pos.x + 30, pos.y + 30, 10, 0xffffff); // Centered (30 is half of 60)
    this.ballSprite.setDepth(20);
  }

  private animateBallScatter(data: any): void {
    if (!this.ballSprite) return;

    const finalPos = this.pitch.getPixelPosition(data.finalX, data.finalY);

    this.tweens.add({
      targets: this.ballSprite,
      x: finalPos.x + 30,
      y: finalPos.y + 30,
      duration: 1000,
      ease: 'Bounce',
    });
  }





  // Interaction Helpers matched to Controller expectations
  public highlightPlayer(playerId: string): void {
    const sprite = this.playerSprites.get(playerId);
    if (sprite) {
      sprite.highlight(0xffff00);
    }
  }

  public unhighlightPlayer(playerId: string): void {
    const sprite = this.playerSprites.get(playerId);
    if (sprite) {
      sprite.unhighlight();
    }
  }

  public handleKickoffInteraction(x: number, y: number, playerAtSquare: any): void {
    if (this.gameService.getPhase() !== GamePhase.KICKOFF) return;

    if (this.kickoffStep === 'SELECT_KICKER') {
      if (playerAtSquare) {
        if (playerAtSquare.teamId !== this.kickingTeam.id) {
          this.showTurnNotification("Select own player!");
          return;
        }
        // Select kicker
        this.selectedPlayerId = playerAtSquare.id;
        this.highlightPlayer(playerAtSquare.id);

        this.kickoffStep = 'SELECT_TARGET';
        this.showTurnNotification("Select Target Square");
      }
    } else if (this.kickoffStep === 'SELECT_TARGET') {
      // VALIDATE TARGET: Must be in opponent's half
      // Pitch is 26 wide. Grid 0-25. Center line is between 12 and 13.
      // Team 1 Start: 0-12? Team 2 Start: 13-25?
      // Actually standard pitch is 26 squares wide. 13 squares per half.
      // Team 1 (Left) usually owns 0-12. Team 2 (Right) owns 13-25.

      const isTeam1Kicking = this.kickingTeam.id === this.team1.id;
      const validTarget = isTeam1Kicking ? (x >= 13) : (x < 13);

      if (!validTarget) {
        this.showTurnNotification("Must kick to opponent half!");
        return;
      }

      if (this.selectedPlayerId) {
        this.gameService.kickBall(this.selectedPlayerId, x, y);
        this.kickoffStep = null;
        this.gameplayController.deselectPlayer();
        this.selectedPlayerId = null;
      }
    }
  }
}
