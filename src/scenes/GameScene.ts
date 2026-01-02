import Phaser from "phaser";
import { Pitch } from "../game/elements/Pitch";
import { GameConfig } from "../config/GameConfig";
import { PlayerSprite } from "../game/elements/PlayerSprite";
import { BallSprite } from "../game/elements/BallSprite";
import { Dugout } from "../game/elements/Dugout";
import { Team } from "../types/Team";
import { Player } from "../types/Player";
import { ServiceContainer } from "../services/ServiceContainer";
import { GameService } from "../services/GameService";
import { IGameService } from "../services/interfaces/IGameService";
import { IEventBus } from "../services/EventBus";
import { SubPhase, GamePhase } from "../types/GameState";
import { GameEventNames } from "../types/events";
import { SetupValidator } from "../game/validators/SetupValidator";
import { FormationManager } from "../game/managers/FormationManager";
import { PlayerPlacementController } from "../game/controllers/PlayerPlacementController";
import { pixelToGrid } from "../game/elements/GridUtils";
import { MovementValidator } from "../game/validators/MovementValidator";
import { GameplayInteractionController } from "../game/controllers/GameplayInteractionController";
import { SceneOrchestrator } from "../game/controllers/SceneOrchestrator";
import { CameraController } from "../game/controllers/CameraController";

// Assets
// Dynamic loading via import.meta.glob
const assetFiles = import.meta.glob("../data/assets/**/*.{png,jpg,gif}", {
  eager: true,
  query: "?url",
  import: "default",
});

/**
 * Game Scene - Unified scene for Setup and Gameplay
 * Game Scene - Unified scene for Setup and Gameplay
 */
export class GameScene extends Phaser.Scene {
  private pitch!: Pitch;
  public team1!: Team;
  public team2!: Team;
  public kickingTeam!: Team;
  public receivingTeam!: Team;

  // UI Components
  // private diceLog!: DiceLog;

  private dugouts: Map<string, Dugout> = new Map();

  // Controllers (Setup Phase)
  private validator!: SetupValidator;
  private formationManager!: FormationManager;
  private placementController!: PlayerPlacementController;
  protected orchestrator!: SceneOrchestrator;

  // Logic
  private movementValidator!: MovementValidator;
  private gameplayController!: GameplayInteractionController;
  protected cameraController!: CameraController;

  // Services
  protected gameService!: IGameService;
  protected eventBus!: IEventBus;

  // State
  private playerSprites: Map<string, PlayerSprite> = new Map();
  private selectedPlayerId: string | null = null;
  public isSetupActive: boolean = false;
  protected ballSprite: Phaser.GameObjects.Container | null = null;
  private pendingKickoffData = null; // Stores kick data for scatter animation

  // Store handlers for cleanup
  private eventHandlers: Map<GameEventNames, () => void> = new Map();

  /**
   * Reload state from ServiceContainer (e.g. after Scenario Load)
   */
  public reloadState(clearPlayerPositions: boolean = true): void {
    const container = ServiceContainer.getInstance();
    this.gameService = container.gameService;
    this.eventBus = container.eventBus;

    // Update Teams

    this.playerSprites.forEach((s) => s.destroy());
    this.playerSprites.clear();

    // CRITICAL: Clear player grid positions from previous scenario
    if (clearPlayerPositions) {
      this.team1.players.forEach((p) => {
        p.gridPosition = undefined;
      });
      this.team2.players.forEach((p) => {
        p.gridPosition = undefined;
      });
    }

    // DON'T destroy ball sprite if we just loaded a scenario (it was just created)
    // Only destroy it when clearing for a fresh scenario load
    if (clearPlayerPositions && this.ballSprite) {
      this.ballSprite.destroy();
      this.ballSprite = null;
    }

    // Destroy old controllers
    if (this.gameplayController) this.gameplayController.destroy();
    if (this.orchestrator) this.orchestrator.destroy();

    // Re-initialize Controllers with NEW service references
    this.initializeControllers();

    // Reinitialize GameplayController with new service reference
    this.gameplayController = new GameplayInteractionController(
      this,
      this.gameService, // NEW reference
      this.eventBus,
      this.pitch,
      this.movementValidator
    );

    // Reinitialize Orchestrator with new service reference
    this.orchestrator = new SceneOrchestrator(
      this,
      this.gameService, // NEW reference
      this.eventBus
    );
    this.orchestrator.setupEventListeners();
    this.setupSceneSpecificListeners(); // Re-setup scene-specific listeners
    this.orchestrator.initialize();

    // Clear Pitch Highlights
    this.pitch.clearHighlights();
    this.pitch.clearHover();
    this.pitch.clearPath();

    // Refresh Display
    this.refreshDugouts();
  }

  constructor(key: string = "GameScene") {
    super({ key });
  }

  init(data: { team1: Team; team2: Team }): void {
    this.team1 = data.team1;
    this.team2 = data.team2;

    // Default kicking/receiving (will be set by coinflip)
    this.kickingTeam = this.team1;
    this.receivingTeam = this.team2;

    // Ensure ServiceContainer is initialized
    if (!ServiceContainer.isInitialized()) {
      const initialState = GameService.createInitialState(
        this.team1,
        this.team2,
        GamePhase.SETUP,
        SubPhase.INTRO
      );
      ServiceContainer.initialize(
        window.eventBus,
        this.team1,
        this.team2,
        initialState
      );
    }

    const container = ServiceContainer.getInstance();
    this.gameService = container.gameService;
    this.eventBus = container.eventBus;
  }

  preload(): void {
    // Dynamic Asset Loading
    // Key format: "asset_[roster]_[position]" (normalized to kebab-case)
    for (const path in assetFiles) {
      const url = assetFiles[path];

      // Parse Path: ../data/assets/[roster]/[filename]
      const parts = path.split("/");
      const filename = parts.pop();
      const folder = parts.pop(); // Roster name (folder)

      if (folder && filename) {
        const nameIdx = filename.lastIndexOf(".");
        const name = nameIdx !== -1 ? filename.substring(0, nameIdx) : filename;

        // Normalize: lowercase, replace spaces with dashes (though folder usually has dashes)
        const rosterKey = folder.toLowerCase().replace(/\s+/g, "-");
        const posKey = name.toLowerCase().replace(/\s+/g, "-");

        const key = `asset_${rosterKey}_${posKey}`;
        this.load.image(key, url as string);
      }
    }
  }

  create(): void {
    const width = this.cameras.main.width;
    const height = this.cameras.main.height;

    // 1. Background (Interactive for deselect)
    // 1. Background (Interactive for deselect)
    this.add
      .rectangle(0, 0, width, height, 0x0a0a1e)
      .setOrigin(0)
      .setInteractive()
      .on("pointerdown", () => this.onBackgroundClick());

    // Audio
    // try {
    //   const container = ServiceContainer.getInstance();
    //   container.soundManager.init();
    //   container.soundManager.playOpeningTheme();
    // } catch (err) {
    //   console.warn('Audio Init Failed', err);
    // }

    // 2. Initialize Core Game Objects
    // Pitch centered horizontally, with fixed top margin
    const pitchX = (width - GameConfig.PITCH_PIXEL_WIDTH) / 2;
    const pitchY = GameConfig.TOP_UI_HEIGHT;
    this.pitch = new Pitch(this, pitchX, pitchY);

    // Dice Log
    // Dice Log - Moved to React
    // this.diceLog = new DiceLog(this, 10, height - 350);

    // Pitch interaction for Play Phase

    // 3. Initialize Dugouts (Top and Bottom)
    console.log(`[GameScene] Screen Dims: ${width}x${height}`);
    console.log(
      `[GameScene] Pitch Y: ${pitchY}, Pitch Height: ${GameConfig.PITCH_PIXEL_HEIGHT}`
    );

    this.createDugouts(pitchX, pitchY);

    this.movementValidator = new MovementValidator();

    // Initialize Gameplay Controller
    this.gameplayController = new GameplayInteractionController(
      this,
      this.gameService,
      this.eventBus,
      this.pitch,
      this.movementValidator
    );

    // Pitch interaction (Now safe to attach)
    this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      if (this.isSetupActive) {
        // Direct Pitch Highlight for Setup
        const pitchContainer = this.pitch.getContainer();
        const localX = pointer.x - pitchContainer.x;
        const localY = pointer.y - pitchContainer.y;

        // Simple bounds check (0-26, 0-15) - hardcoded for now, or use Pitch dims
        if (
          localX >= 0 &&
          localX <= 26 * 60 &&
          localY >= 0 &&
          localY <= 15 * 60
        ) {
          const gridPos = pixelToGrid(localX, localY, 60);
          this.pitch.highlightHoverSquare(gridPos.x, gridPos.y);
        } else {
          this.pitch.clearHover();
        }
        return;
      }
      this.gameplayController.handlePointerMove(pointer, this.isSetupActive);
    });

    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      console.log(
        `[GameScene] Global PointerDown: ${pointer.worldX}, ${pointer.worldY}`
      );
      this.gameplayController.handlePointerDown(pointer, this.isSetupActive);
    });

    // Global Key Inputs
    this.input.keyboard?.on("keydown-ESC", () => {
      this.onBackgroundClick();
    });

    this.initializeControllers();

    // Initialize Camera Controller with pitch bounds
    const pitchContainer = this.pitch.getContainer();
    this.cameraController = new CameraController(this, {
      x: pitchContainer.x,
      y: pitchContainer.y,
      width: GameConfig.PITCH_PIXEL_WIDTH,
      height: GameConfig.PITCH_PIXEL_HEIGHT,
    });

    // Camera keyboard shortcuts
    this.input.keyboard?.on("keydown-ZERO", () => {
      this.cameraController.reset(600);
    });

    this.input.keyboard?.on("keydown-ONE", () => {
      this.cameraController.showAllPlayers(600);
    });

    // 6. Setup Orchestrator for game flow (AFTER controllers are ready)
    this.orchestrator = new SceneOrchestrator(
      this,
      this.gameService,
      this.eventBus
    );
    this.orchestrator.setupEventListeners();
    this.setupSceneSpecificListeners(); // Setup-specific events
    this.orchestrator.initialize();

    this.eventBus.on(GameEventNames.PlayerActivated, (playerId: string) => {
      const sprite = this.playerSprites.get(playerId);
      if (sprite) {
        sprite.setActivated(true);
      }
    });

    this.eventBus.on(GameEventNames.TurnStarted, () => {
      // Reset all sprites
      this.playerSprites.forEach((sprite) => sprite.setActivated(false));
      // Reset selection
      this.gameplayController.deselectPlayer();
      // Show Turn notification
      // this.eventBus.emit(GameEventNames.UI_Notification, `Turn ${turnData.turnNumber} started!`);
    });

    // Camera event listeners
    this.eventBus.on(
      GameEventNames.Camera_TrackBall,
      async (data: { ballSprite; animationDuration: number }) => {
        if (this.cameraController && data.ballSprite) {
          // First, smoothly pan to the ball position
          const ballPos = { x: data.ballSprite.x, y: data.ballSprite.y };
          await this.cameraController.panTo(ballPos.x, ballPos.y, 500);

          // Then zoom in and start tracking
          await this.cameraController.zoomTo(2.5, 400);
          this.cameraController.trackObject(data.ballSprite, 2.5, 0);

          // Auto-reset removed to allow manual control via Camera_Reset events
          // and support chained animations (e.g. Pass Declared -> Pass Flight -> Bounce)
        }
      }
    );

    this.eventBus.on(
      GameEventNames.Camera_Reset,
      (data: { duration?: number }) => {
        if (this.cameraController) {
          this.cameraController.reset(data.duration || 800);
        }
      }
    );

    // Cleanup on scene shutdown
    this.events.on(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);
    this.events.on(Phaser.Scenes.Events.DESTROY, this.shutdown, this);
  }

  private shutdown(): void {
    // Remove all listeners attached by this scene
    this.eventHandlers.forEach((handler, event) => {
      this.eventBus.off(event, handler);
    });
    this.eventHandlers.clear();

    // Controller cleanup if needed
    if (this.gameplayController) {
      this.gameplayController.destroy();
    }

    // Camera controller cleanup
    if (this.cameraController) {
      this.cameraController.destroy();
    }

    // CRITICAL: Destroy all visual elements to prevent leaks between scenes
    // Destroy player sprites
    this.playerSprites.forEach((sprite) => sprite.destroy());
    this.playerSprites.clear();

    // Destroy ball sprite
    if (this.ballSprite) {
      this.ballSprite.destroy();
      this.ballSprite = null;
    }

    // Destroy dugouts (if they exist)
    if (this.dugouts) {
      this.dugouts.forEach((dugout) => {
        // Dugout is a Phaser Container, use destroy method
        if (dugout && typeof dugout.destroy === "function") {
          dugout.destroy();
        }
      });
      this.dugouts.clear();
    }

    // Destroy pitch (if it exists)
    if (this.pitch) {
      // Pitch is a custom class with a container, destroy the container
      const container = this.pitch.getContainer();
      if (container && typeof container.destroy === "function") {
        container.destroy();
      }
    }

    // Clear placement controller
    if (this.placementController) {
      // PlacementController might not have a destroy method, just null it
      this.placementController = null;
    }
  }

  private createDugouts(pitchX: number, pitchY: number): void {
    // Top Dugout (Team 1)
    // Placed at the very top of the canvas (y=0)
    // Dugout height is ~150px. Pitch starts at TOP_UI_HEIGHT (160px).
    const topDugoutY = 0;
    const topDugout = new Dugout(this, pitchX, topDugoutY, this.team1);
    topDugout.setDepth(10);
    this.dugouts.set(this.team1.id, topDugout);

    // Bottom Dugout (Team 2)
    // Placed below Pitch.
    // Pitch ends at pitchY + PITCH_PIXEL_HEIGHT.
    // Add 10px padding.
    const bottomDugoutY = pitchY + GameConfig.PITCH_PIXEL_HEIGHT + 10;

    const bottomDugout = new Dugout(this, pitchX, bottomDugoutY, this.team2);
    bottomDugout.setDepth(10); // Ensure dugout container is above background
    this.dugouts.set(this.team2.id, bottomDugout);

    // Wire up drags
    [topDugout, bottomDugout].forEach((d) => {
      d.setDragCallbacks(
        (id) => this.onDugoutDragStart(id),
        (id, x, y) => this.onDugoutDragEnd(id, x, y)
      );
    });
  }

  private initializeControllers(): void {
    this.validator = new SetupValidator();
    this.formationManager = new FormationManager();
    this.placementController = new PlayerPlacementController(
      this,
      this.pitch,
      this.validator
    );

    // Handle late UI mounting (handshake)
    this.eventBus.on(GameEventNames.UI_RequestCoinFlipState, () => {
      if (this.isSetupActive) {
        // Only re-emit if we haven't started placement yet (e.g. still in coin flip)
        // Simplified: just re-emit if setup is active and no kickingTeam/receivingTeam set?
        // Or better: If we are in setup phase, show it.
        // Actually, CoinFlipController used to handle showing.
        // If we are strictly in the "Coin Toss" step, we should emit.
        // How do we know we are in coin toss vs placement?
        // We can check if kickoffStep is null? Or just emit it always for now if Setup is active and placement hasn't started?
        // Safest: Use a flag or check game service state.

        // For now, if setup active we just re-broadcast current state.
        this.eventBus.emit(GameEventNames.UI_StartCoinFlip, {
          team1: this.team1,
          team2: this.team2,
        });
      }
    });
  }

  // Start setup phase - can be overridden by subclasses (e.g., SandboxScene)
  public startSetupPhase(): void {
    this.isSetupActive = true;
    this.eventBus.emit(GameEventNames.UI_StartCoinFlip, {
      team1: this.team1,
      team2: this.team2,
    });
  }

  // Delegate to orchestrator
  public startPlacement(subPhase: SubPhase): void {
    this.orchestrator.startPlacement(subPhase);
  }

  // Visual helper methods called by orchestrator
  public highlightSetupZone(isTeam1: boolean): void {
    this.pitch.highlightSetupZone(isTeam1);
  }

  public enablePlacement(activeTeam: Team, isTeam1: boolean): void {
    const dugout = this.dugouts.get(activeTeam.id);
    const sprites = dugout ? dugout.getSprites() : new Map();
    this.placementController.enablePlacement(activeTeam, isTeam1, sprites);
  }

  // Setup-specific event listeners (placement controller events only)
  // All game flow logic has been moved to SceneOrchestrator
  private setupSceneSpecificListeners(): void {
    // Listen for placement changes from the placement controller
    // These are scene-specific because they directly interact with the controller
    this.placementController.on(
      GameEventNames.PlayerPlaced,
      (data: { playerId: string; x: number; y: number }) => {
        this.gameService.placePlayer(data.playerId, data.x, data.y);
        this.refreshDugouts();
        this.checkSetupCompleteness();
      }
    );

    this.placementController.on(
      GameEventNames.PlayerRemoved,
      (playerId: string) => {
        this.gameService.removePlayer(playerId);
        this.refreshDugouts();
        this.checkSetupCompleteness();
      }
    );
  }

  public refreshDugouts(): void {
    this.dugouts.forEach((d) => d.refresh());
    this.placePlayersOnPitch();
  }

  public startPlayPhase(): void {
    this.isSetupActive = false;
    this.pitch.clearHighlights(); // Clear setup zones
    this.eventBus.emit(GameEventNames.UI_HideSetupControls);

    // Ensure all players are placed
    this.placePlayersOnPitch();
  }

  public startKickoffPhase(subPhase?: SubPhase): void {
    this.isSetupActive = false;
    this.pitch.clearHighlights();
    this.eventBus.emit(GameEventNames.UI_HideSetupControls);

    // Ensure players are visible and correct
    this.placePlayersOnPitch();

    // Logic based on subphase
    if (subPhase === SubPhase.SETUP_KICKOFF) {
      this.eventBus.emit(
        GameEventNames.UI_Notification,
        "Select Kicker & Target"
      );
    }
  }

  protected placePlayersOnPitch(): void {
    // Get all players that have a grid position
    const allPlayers = [
      ...this.team1.players.filter((p) => p.gridPosition),
      ...this.team2.players.filter((p) => p.gridPosition),
    ];

    allPlayers.forEach((player) => {
      const pos = this.pitch.getPixelPosition(
        player.gridPosition!.x,
        player.gridPosition!.y
      );

      if (this.playerSprites.has(player.id)) {
        const sprite = this.playerSprites.get(player.id)!;
        sprite.setPosition(pos.x, pos.y);
        sprite.setVisible(true);
        sprite.setDepth(10);
      } else {
        const team = player.teamId === this.team1.id ? this.team1 : this.team2;
        const teamColor = team.colors.primary;
        // Pass rosterName for asset lookup
        const sprite = new PlayerSprite(
          this,
          pos.x,
          pos.y,
          player,
          teamColor,
          team.rosterName
        );
        sprite.setDepth(10);
        this.playerSprites.set(player.id, sprite);
      }
    });

    // Hide any players that are in dugouts but still have visible pitch sprites
    // (This handles moving from pitch back to dugout)
    [...this.team1.players, ...this.team2.players].forEach((player) => {
      if (!player.gridPosition && this.playerSprites.has(player.id)) {
        this.playerSprites.get(player.id)!.setVisible(false);
      }
    });

    // Ball is now in scene root with depth 100, so it automatically renders above players (depth 10)
    // No need to manually bring to top

    this.checkSetupCompleteness();
  }

  // Delegate to orchestrator
  private checkSetupCompleteness(): void {
    this.orchestrator.checkSetupCompleteness();
  }

  // Interactivity
  private onBackgroundClick(): void {
    if (this.isSetupActive) {
      this.placementController?.deselectPlayer();
      this.pitch.clearHighlights();
    } else {
      // Delegate to controller to ensure state (waypoints, selection) is cleared
      this.gameplayController?.deselectPlayer();
    }
  }

  private deselectPlayer(): void {
    if (this.selectedPlayerId) {
      const sprite = this.playerSprites.get(this.selectedPlayerId);
      if (sprite) sprite.unhighlight();
      this.selectedPlayerId = null;
    }
    this.clearAllHighlights();
  }

  /**
   * Clear all highlights - delegates to controller for proper cleanup order
   */
  public clearAllHighlights(): void {
    if (this.gameplayController) {
      this.gameplayController.clearAllInteractionHighlights();
    } else {
      // Fallback if controller not initialized yet
      this.pitch.clearHighlights();
      this.pitch.clearPath();
      this.pitch.clearHover();
    }
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

  protected placeBallVisual(x: number, y: number): void {
    if (this.ballSprite) {
      this.ballSprite.destroy();
    }

    // Use WORLD coordinates (same as players) since ball will be in scene root
    const pos = this.pitch.getPixelPosition(x, y);

    this.ballSprite = new BallSprite(this, pos.x, pos.y);

    // CRITICAL: Add ball to SCENE ROOT (not pitch container)
    // This puts it in the same rendering context as players
    // Players are at depth 10, so ball at depth 100 will render on top
    this.ballSprite.setDepth(100);
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
}
