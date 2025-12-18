import Phaser from "phaser";
import { Pitch } from "../game/elements/Pitch";
import { PlayerSprite } from "../game/elements/PlayerSprite";
import { BallSprite } from "../game/elements/BallSprite";
import { Dugout } from "../game/elements/Dugout";
import { Team } from "../types/Team";
import { Player } from "../types/Player";
import { ServiceContainer } from "../services/ServiceContainer";
import { IGameService } from "../services/interfaces/IGameService";
import { IEventBus } from "../services/EventBus";
import { GamePhase, SubPhase } from "../types/GameState";
import {
  SetupValidator,
} from "../game/validators/SetupValidator";
import {
  FormationManager,
} from "../game/managers/FormationManager";
import {
  PlayerPlacementController,
} from "../game/controllers/PlayerPlacementController";
import { pixelToGrid } from "../game/elements/GridUtils";
import { MovementValidator } from "../game/validators/MovementValidator";
import { GameplayInteractionController } from "../game/controllers/GameplayInteractionController";
import { SceneOrchestrator } from "../game/controllers/SceneOrchestrator";

// Assets
// Dynamic loading via import.meta.glob
const assetFiles = import.meta.glob('../data/assets/**/*.{png,jpg,gif}', { eager: true, query: '?url', import: 'default' });

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

  // Services
  protected gameService!: IGameService;
  protected eventBus!: IEventBus;

  // State
  private playerSprites: Map<string, PlayerSprite> = new Map();
  private selectedPlayerId: string | null = null;
  public isSetupActive: boolean = false;
  private pendingKickoffData: any = null;
  private ballSprite: Phaser.GameObjects.Container | null = null;

  // Store handlers for cleanup
  private eventHandlers: Map<string, Function> = new Map();

  /**
   * Reload state from ServiceContainer (e.g. after Scenario Load)
   */
  public reloadState(): void {
    const container = ServiceContainer.getInstance();
    this.gameService = container.gameService;
    this.eventBus = container.eventBus;

    // Update Teams
    const state = this.gameService.getState();
    // We need to re-fetch teams from the service/container or re-pass them?
    // ServiceContainer DOES NOT hold teams publicly, but GameService does.
    // We should expose teams on GameService or Container?
    // GameService has them private. let's assume reuse of init data OR passed data.
    // BUT ScenarioLoader modified the teams passed to it.
    // Since SandboxScene holds the team references, they are mutated in place. 
    // So team1/team2 references might be valid, but we need to re-bind controllers.

    // Cleanup old sprites
    this.playerSprites.forEach(s => s.destroy());
    this.playerSprites.clear();

    if (this.ballSprite) {
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
      this.gameService,  // NEW reference
      this.eventBus,
      this.pitch,
      this.movementValidator
    );

    // Reinitialize Orchestrator with new service reference
    this.orchestrator = new SceneOrchestrator(
      this,
      this.gameService,  // NEW reference
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
      const parts = path.split('/');
      const filename = parts.pop();
      const folder = parts.pop(); // Roster name (folder)

      if (folder && filename) {
        const nameIdx = filename.lastIndexOf('.');
        const name = nameIdx !== -1 ? filename.substring(0, nameIdx) : filename;

        // Normalize: lowercase, replace spaces with dashes (though folder usually has dashes)
        const rosterKey = folder.toLowerCase().replace(/\s+/g, '-');
        const posKey = name.toLowerCase().replace(/\s+/g, '-');

        const key = `asset_${rosterKey}_${posKey}`;
        // console.log(`Loading Asset: ${key} -> ${path}`);
        this.load.image(key, url as string);
      }
    }
  }

  create(): void {
    const width = this.cameras.main.width;
    const height = this.cameras.main.height;

    // 1. Background (Interactive for deselect)
    // 1. Background (Interactive for deselect)
    this.add.rectangle(0, 0, width, height, 0x0a0a1e).setOrigin(0).setInteractive().on('pointerdown', () => this.onBackgroundClick());

    // Audio
    // try {
    //   const container = ServiceContainer.getInstance();
    //   container.soundManager.init();
    //   container.soundManager.playOpeningTheme();
    // } catch (err) {
    //   console.warn('Audio Init Failed', err);
    // }

    // 2. Initialize Core Game Objects
    // Pitch centered
    const pitchX = (width - 1200) / 2;
    const pitchY = 180; // Leaving room for top dugout
    this.pitch = new Pitch(this, pitchX, pitchY);

    // Dice Log
    // Dice Log - Moved to React
    // this.diceLog = new DiceLog(this, 10, height - 350);

    // Pitch interaction for Play Phase


    // 3. Initialize Dugouts (Top and Bottom)
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
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (this.isSetupActive) {
        // Direct Pitch Highlight for Setup
        const pitchContainer = this.pitch.getContainer();
        const localX = pointer.x - pitchContainer.x;
        const localY = pointer.y - pitchContainer.y;

        // Simple bounds check (0-26, 0-15) - hardcoded for now, or use Pitch dims
        if (localX >= 0 && localX <= 26 * 60 && localY >= 0 && localY <= 15 * 60) {
          const gridPos = pixelToGrid(localX, localY, 60);
          this.pitch.highlightHoverSquare(gridPos.x, gridPos.y);
        } else {
          this.pitch.clearHover();
        }
        return;
      }
      this.gameplayController.handlePointerMove(pointer, this.isSetupActive);
    });

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      this.gameplayController.handlePointerDown(pointer, this.isSetupActive);
    });

    // Global Key Inputs
    this.input.keyboard?.on('keydown-ESC', () => {
      this.onBackgroundClick();
    });

    this.initializeControllers();

    // 6. Setup Orchestrator for game flow (AFTER controllers are ready)
    this.orchestrator = new SceneOrchestrator(
      this,
      this.gameService,
      this.eventBus
    );
    this.orchestrator.setupEventListeners();
    this.setupSceneSpecificListeners(); // Setup-specific events
    this.orchestrator.initialize();

    this.eventBus.on('playerActivated', (playerId: string) => {
      const sprite = this.playerSprites.get(playerId);
      if (sprite) {
        sprite.setActivated(true);
      }
    });

    this.eventBus.on('turnStarted', (turnData: any) => {
      // Reset all sprites
      this.playerSprites.forEach(sprite => sprite.setActivated(false));
      // Reset selection
      this.gameplayController.deselectPlayer();
      // Show Turn notification
      // this.eventBus.emit('ui:notification', `Turn ${turnData.turnNumber} started!`);
    });

    // Cleanup on scene shutdown
    this.events.on(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);
    this.events.on(Phaser.Scenes.Events.DESTROY, this.shutdown, this);
  }

  private shutdown(): void {
    // Remove all listeners attached by this scene
    this.eventHandlers.forEach((handler, event) => {
      this.eventBus.off(event, handler as any);
    });
    this.eventHandlers.clear();

    // Controller cleanup if needed
    if (this.gameplayController) {
      this.gameplayController.destroy();
    }

    // CRITICAL: Destroy all visual elements to prevent leaks between scenes
    // Destroy player sprites
    this.playerSprites.forEach(sprite => sprite.destroy());
    this.playerSprites.clear();

    // Destroy ball sprite
    if (this.ballSprite) {
      this.ballSprite.destroy();
      this.ballSprite = null;
    }

    // Destroy dugouts (if they exist)
    if (this.dugouts) {
      this.dugouts.forEach(dugout => {
        // Dugout is a Phaser Container, use destroy method
        if (dugout && typeof dugout.destroy === 'function') {
          dugout.destroy();
        }
      });
      this.dugouts.clear();
    }

    // Destroy pitch (if it exists)
    if (this.pitch) {
      // Pitch is a custom class with a container, destroy the container
      const container = this.pitch.getContainer();
      if (container && typeof container.destroy === 'function') {
        container.destroy();
      }
    }

    // Clear placement controller
    if (this.placementController) {
      // PlacementController might not have a destroy method, just null it
      this.placementController = null as any;
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



  private initializeControllers(): void {
    this.validator = new SetupValidator();
    this.formationManager = new FormationManager();
    this.placementController = new PlayerPlacementController(this, this.pitch, this.validator);

    // Handle late UI mounting (handshake)
    this.eventBus.on("ui:requestCoinFlipState", () => {
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
        this.eventBus.emit("ui:startCoinFlip", { team1: this.team1, team2: this.team2 });
      }
    });
  }

  // Start setup phase - can be overridden by subclasses (e.g., SandboxScene)
  public startSetupPhase(): void {
    this.isSetupActive = true;
    this.eventBus.emit("ui:startCoinFlip", { team1: this.team1, team2: this.team2 });
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
  }

  public refreshDugouts(): void {
    this.dugouts.forEach(d => d.refresh());
    this.placePlayersOnPitch();
  }

  public startPlayPhase(): void {
    this.isSetupActive = false;
    this.pitch.clearHighlights(); // Clear setup zones
    this.eventBus.emit("ui:hideSetupControls");

    // Ensure all players are placed
    this.placePlayersOnPitch();
  }

  public startKickoffPhase(subPhase?: SubPhase): void {
    this.isSetupActive = false;
    this.pitch.clearHighlights();
    this.eventBus.emit("ui:hideSetupControls");

    // Ensure players are visible and correct
    this.placePlayersOnPitch();

    // Logic based on subphase
    if (subPhase === SubPhase.SETUP_KICKOFF) {
      this.eventBus.emit('ui:notification', "Select Kicker & Target");
    }
  }

  protected placePlayersOnPitch(): void {

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
        const team = player.teamId === this.team1.id ? this.team1 : this.team2;
        const teamColor = team.colors.primary;
        // Pass rosterName for asset lookup
        const sprite = new PlayerSprite(this, pos.x, pos.y, player, teamColor, team.rosterName);
        sprite.setDepth(10);
        this.playerSprites.set(player.id, sprite);

        // Add interactivity for Play phase (setup phase uses placementController)
        sprite.setInteractive({ useHandCursor: true });
        sprite.on('pointerdown', () => this.onPlayerClick(player));
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
    if (this.ballSprite) this.ballSprite.destroy();

    const pos = this.pitch.getPixelPosition(x, y);
    this.ballSprite = new BallSprite(this, pos.x, pos.y);
  }


  private animateBallScatter(data: any): void {
    if (!this.ballSprite) return;

    const finalPos = this.pitch.getPixelPosition(data.finalX, data.finalY);

    this.tweens.add({
      targets: this.ballSprite,
      x: finalPos.x,
      y: finalPos.y,
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

}
