import Phaser from "phaser";
import { Pitch } from "../game/elements/Pitch";
import { GameConfig } from "../config/GameConfig";
import { PlayerSprite } from "../game/elements/PlayerSprite";
import { BallSprite } from "../game/elements/BallSprite";
import { Dugout } from "../game/elements/Dugout";
import { centeredHitArea } from "../game/elements/InteractiveHitArea";
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
import {
  DEFAULT_PITCH_THEME_ID,
  PitchThemeId,
  resolvePitchTheme,
} from "../game/presentation/pitchThemes";
import { BoardLabel } from "../game/presentation/boardLabels";
import {
  createMatchSave,
  MatchSave,
  restoreMatchSave,
} from "../headless/serialization";
import { CompetitionContext } from "../competition/types";
import { MatchAutosave } from "../game/persistence/MatchAutosave";
import {
  findBoardStateConflicts,
  isActivatedThisTurn,
  resolveBallRepresentation,
  resolvePlayerLocation,
} from "../game/presentation/boardState";

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
  private pitchThemeId: PitchThemeId = DEFAULT_PITCH_THEME_ID;
  private competitionContext?: CompetitionContext;
  private autosave: MatchAutosave | null = null;
  private resumedMatch = false;
  private autosaveEnabled = false;

  // Store handlers for cleanup
  private eventHandlers: Map<GameEventNames, () => void> = new Map();
  /** Unsubscribe callbacks for every EventBus listener this scene registers. */
  private busSubscriptions: Array<() => void> = [];

  /**
   * Subscribe to the shared EventBus and remember how to unsubscribe. The bus
   * outlives the scene, so anything registered without this survives shutdown
   * and gets called back against a destroyed scene.
   */
  protected subscribe<
    K extends keyof import("../services/EventBus").GameEventMap,
  >(
    event: K,
    handler: (data: import("../services/EventBus").GameEventMap[K]) => void
  ): void {
    this.eventBus.on(event, handler);
    this.busSubscriptions.push(() => this.eventBus.off(event, handler));
  }

  /**
   * A destroyed or shut-down scene must never build display objects: Phaser's
   * systems are gone and `new Sprite(this, …)` dereferences null. Guards the
   * sprite factories so a leaked callback becomes a logged no-op, not a crash.
   */
  protected isSceneLive(where: string): boolean {
    // Phaser scene status is ordered; everything below SHUTDOWN (8) is a
    // scene that still has its systems, including INIT/CREATING.
    const shutdown = Phaser.Scenes?.SHUTDOWN ?? 8;
    const status = this.sys?.settings?.status;
    if (status !== undefined && status < shutdown) return true;
    console.warn(
      `[GameScene] ${where} ignored: scene "${this.sys?.settings?.key ?? "GameScene"}" is no longer active`
    );
    return false;
  }

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

    // Refresh Display — rebuild (not just refresh) so a roster swap in the
    // loaded scenario replaces the dugouts' stale team references.
    this.rebuildDugouts();
    // A scenario/save restore rebuilds ball, pitch/dugout placement and
    // activation styling through the SAME reconcilers uninterrupted play uses,
    // against the service reference this reload just installed.
    this.reconcileBoard();
  }

  constructor(key: string = "GameScene") {
    super({ key });
  }

  init(data: {
    team1: Team;
    team2: Team;
    progressionEnabled?: boolean;
    pitchThemeId?: string;
    competitionContext?: CompetitionContext;
    resumeSave?: MatchSave;
    autosaveEnabled?: boolean;
  }): void {
    const restored = data.resumeSave ? restoreMatchSave(data.resumeSave) : null;
    this.team1 = restored?.teams[0] ?? data.team1;
    this.team2 = restored?.teams[1] ?? data.team2;
    this.pitchThemeId = resolvePitchTheme(
      restored?.save.presentation?.pitchThemeId ?? data.pitchThemeId
    ).id;
    this.competitionContext =
      restored?.save.competition ?? data.competitionContext;
    this.resumedMatch = !!restored;
    this.autosaveEnabled =
      data.autosaveEnabled ?? this.sys.settings.key === "GameScene";

    // Default kicking/receiving (will be set by coinflip)
    this.kickingTeam =
      restored?.save.drive.kickingTeamId === this.team2.id
        ? this.team2
        : this.team1;
    this.receivingTeam =
      restored?.save.drive.receivingTeamId === this.team1.id
        ? this.team1
        : this.team2;

    // Ensure ServiceContainer is initialized
    if (!ServiceContainer.isInitialized()) {
      const initialState =
        restored?.state ??
        GameService.createInitialState(
          this.team1,
          this.team2,
          GamePhase.SETUP,
          SubPhase.INTRO
        );
      ServiceContainer.initialize(
        window.eventBus,
        this.team1,
        this.team2,
        initialState,
        undefined,
        undefined,
        restored?.save.matchStats.progressionEnabled ??
          data.progressionEnabled ??
          false,
        restored?.save.rng,
        restored?.save.matchStats,
        restored?.save.turnManager
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
    this.pitch = new Pitch(this, pitchX, pitchY, this.pitchThemeId, {
      left: this.team1.colors.primary,
      right: this.team2.colors.primary,
    });

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

        // Theme-independent pitch bounds.
        if (
          localX >= 0 &&
          localX < GameConfig.PITCH_PIXEL_WIDTH &&
          localY >= 0 &&
          localY < GameConfig.PITCH_PIXEL_HEIGHT
        ) {
          const gridPos = pixelToGrid(localX, localY, GameConfig.SQUARE_SIZE);
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
    this.cameraController = new CameraController(
      this,
      {
        x: pitchContainer.x,
        y: pitchContainer.y,
        width: GameConfig.PITCH_PIXEL_WIDTH,
        height: GameConfig.PITCH_PIXEL_HEIGHT,
      },
      this.eventBus
    );

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

    if (this.resumedMatch) {
      // Restore rebuilds presentation from canonical state only — the same
      // reconcilers uninterrupted play uses, so a resumed board cannot drift.
      this.reconcileBoard();
      this.eventBus.emit(
        GameEventNames.GameStateRestored,
        this.gameService.getState()
      );
    }

    if (this.autosaveEnabled) {
      const container = ServiceContainer.getInstance();
      this.autosave = new MatchAutosave(
        this.eventBus,
        this.gameService,
        () =>
          createMatchSave({
            state: this.gameService.getState(),
            teams: [this.team1, this.team2],
            drive: {
              kickingTeamId: this.kickingTeam.id,
              receivingTeamId: this.receivingTeam.id,
            },
            rng: container.rngService.captureState(),
            matchStats: container.matchStats.captureState(),
            turnManager: this.gameService.captureTurnManagerState(),
            competition: this.competitionContext,
            presentation: { pitchThemeId: this.pitchThemeId },
          }),
        { enabled: true }
      );
      this.autosave.start();
    }

    this.subscribe(GameEventNames.PlayerActivated, (playerId: string) => {
      const sprite = this.playerSprites.get(playerId);
      if (sprite) {
        sprite.setActivated(true);
      }
    });

    this.subscribe(GameEventNames.TurnStarted, (turnData) => {
      // Reset all sprites and mark the active team with square borders
      this.playerSprites.forEach((sprite) => {
        sprite.setActivated(false);
        sprite.setTeamTurnBorder(sprite.getPlayer().teamId === turnData.teamId);
      });
      // Reset selection
      this.gameplayController.deselectPlayer();
    });

    // Camera event listeners
    this.subscribe(
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

    this.subscribe(
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
    this.autosave?.dispose();
    this.autosave = null;
    // Remove all listeners attached by this scene
    this.eventHandlers.forEach((handler, event) => {
      this.eventBus.off(event, handler);
    });
    this.eventHandlers.clear();
    this.busSubscriptions.forEach((unsubscribe) => unsubscribe());
    this.busSubscriptions = [];

    // Controller cleanup if needed
    if (this.gameplayController) {
      this.gameplayController.destroy();
    }

    // The orchestrator holds this scene AND the active phase handler, which
    // holds its own EventBus subscriptions. The bus outlives the scene, so a
    // handler left subscribed here is what delivered a second match's
    // BallKicked to a destroyed first-match scene.
    if (this.orchestrator) {
      this.orchestrator.destroy();
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
    if (!this.isSceneLive("createDugouts")) return;
    // Top Dugout (Team 1)
    // Placed at the very top of the canvas (y=0)
    // Dugout height is ~150px. Pitch starts at TOP_UI_HEIGHT (160px).
    const topDugoutY = 0;
    const topDugout = new Dugout(
      this,
      pitchX,
      topDugoutY,
      this.team1,
      150,
      false,
      this.pitchThemeId
    );
    topDugout.setDepth(10);
    this.dugouts.set(this.team1.id, topDugout);

    // Bottom Dugout (Team 2)
    // Placed below Pitch.
    // Pitch ends at pitchY + PITCH_PIXEL_HEIGHT.
    // Add 10px padding.
    const bottomDugoutY = pitchY + GameConfig.PITCH_PIXEL_HEIGHT + 10;

    // Team 2 plays the right side: mirror so reserves sit on the right,
    // and right-align the whole dugout with the pitch's right edge
    const bottomDugout = new Dugout(
      this,
      pitchX,
      bottomDugoutY,
      this.team2,
      150,
      true,
      this.pitchThemeId
    );
    bottomDugout.x =
      pitchX + GameConfig.PITCH_PIXEL_WIDTH - bottomDugout.getTotalWidth();
    bottomDugout.setDepth(10); // Ensure dugout container is above background
    this.dugouts.set(this.team2.id, bottomDugout);

    // Wire up drags
    [topDugout, bottomDugout].forEach((d) => {
      d.setDragCallbacks(
        (id) => this.onDugoutDragStart(id),
        (id, x, y) => this.onDugoutDragEnd(id, x, y)
      );
    });

    this.emitBoardLabels(pitchX, pitchY, topDugout, bottomDugout);
  }

  /**
   * Publish all board text (dugout headers, sideline crew, end-zone team
   * names) in canvas design coordinates for the React overlay to render as
   * crisp DOM text. Called whenever the dugouts are (re)built.
   */
  private emitBoardLabels(
    pitchX: number,
    pitchY: number,
    top: Dugout,
    bottom: Dugout
  ): void {
    const labels: BoardLabel[] = [];

    const addDugout = (dugout: Dugout, prefix: string) => {
      dugout.getLabels().forEach((label, i) => {
        labels.push({
          ...label,
          id: `${prefix}-${i}`,
          x: label.x + dugout.x,
          y: label.y + dugout.y,
        });
      });
    };
    addDugout(top, `dugout-${this.team1.id}`);
    addDugout(bottom, `dugout-${this.team2.id}`);

    // End-zone team names: rotated, centred in the single-square end zones.
    // team1 defends the left end zone, team2 the right (matching the dugouts).
    const midY = pitchY + GameConfig.PITCH_PIXEL_HEIGHT / 2;
    const half = GameConfig.SQUARE_SIZE / 2;
    // The zone fill already carries the team colour, so the name itself is a
    // light parchment for legibility over any team colour. The two names are
    // mirror-rotated so each reads upward from its own touchline.
    const endZone = (
      id: string,
      team: Team,
      x: number,
      rotation: number
    ): BoardLabel => ({
      id,
      text: team.name,
      x,
      y: midY,
      size: 30,
      weight: "bold",
      align: "center",
      rotation,
      color: "#f6efdd",
      opacity: 0.95,
      tracking: 3,
    });
    labels.push(endZone("endzone-left", this.team1, pitchX + half, 90));
    labels.push(
      endZone(
        "endzone-right",
        this.team2,
        pitchX + GameConfig.PITCH_PIXEL_WIDTH - half,
        -90
      )
    );

    this.eventBus.emit(GameEventNames.UI_BoardLabels, { labels });
  }

  /**
   * Recreate both dugouts against the CURRENT team objects. A scenario load
   * swaps this.team1/this.team2 for new rosters (new team ids), leaving the
   * existing dugouts pointing at the old teams — so a plain refresh keeps
   * rendering the previous roster's reserves. Rebuild to follow the swap.
   */
  private rebuildDugouts(): void {
    const width = this.cameras.main.width;
    const pitchX = (width - GameConfig.PITCH_PIXEL_WIDTH) / 2;
    const pitchY = GameConfig.TOP_UI_HEIGHT;
    this.dugouts.forEach((d) => d.destroy());
    this.dugouts.clear();
    this.createDugouts(pitchX, pitchY);
  }

  private initializeControllers(): void {
    this.validator = new SetupValidator();
    this.formationManager = new FormationManager();
    this.placementController = new PlayerPlacementController(
      this,
      this.pitch,
      this.validator
    );

    // Handle late UI mounting (handshake).
    // The coin flip only exists before the first drive — later drives set
    // the kicking team automatically, so never re-show the overlay then.
    this.subscribe(GameEventNames.UI_RequestCoinFlipState, () => {
      if (this.isSetupActive && this.gameService.canCoinFlip()) {
        this.eventBus.emit(GameEventNames.UI_StartCoinFlip, {
          team1: this.team1,
          team2: this.team2,
        });
      }
    });

    // End-of-drive: clear the ball visual and refresh dugouts/pitch when the
    // engine resets drive state, and surface KO recovery results.
    this.subscribe(GameEventNames.RefreshBoard, () => {
      if (this.ballSprite) {
        this.ballSprite.destroy();
        this.ballSprite = null;
      }
      // New drive: nobody is "activated", turn borders reset, and any player
      // left Prone (rotated 90°) is stood back upright so the rotation does
      // not carry into the next drive when the sprite is re-placed.
      this.playerSprites.forEach((sprite) => {
        sprite.setActivated(false);
        sprite.setTeamTurnBorder(false);
        sprite.resetOrientation();
      });
      this.refreshDugouts();
    });

    // Online: a snapshot arrived — reconcile the board to authoritative state.
    // In setup we do a full refresh (repositions from state). In play we only
    // reconcile status visuals (down/up/stunned/off-pitch): a full refresh
    // would snap a mid-animation mover to its grid square, but updateStatus
    // touches only alpha/angle/visibility, never position — so it's safe and
    // catches any status-change event the watcher missed.
    this.subscribe(GameEventNames.UI_SyncBoard, () => {
      if (this.gameService.getPhase() === GamePhase.SETUP) {
        this.refreshDugouts();
      } else {
        this.syncPlayerStatuses();
      }
    });

    // Touchdown celebration: the scoring team's players on the pitch jump
    this.subscribe(GameEventNames.Touchdown, (data) => {
      this.playerSprites.forEach((sprite) => {
        const p = sprite.getPlayer();
        if (p.teamId === data.teamId && p.gridPosition) {
          sprite.playCelebrateAnimation();
        }
      });
    });

    this.subscribe(GameEventNames.KORecoveryRolled, (data) => {
      const player = this.gameService.getPlayerById(data.playerId);
      const name = player?.playerName ?? data.playerId;
      this.eventBus.emit(GameEventNames.UI_LogEntry, {
        category: "drive",
        headline: data.recovered ? `${name} recovers!` : `${name} still out`,
        detail: data.recovered
          ? "Shakes it off and returns to the Reserves."
          : "Still out cold.",
        roll: data.roll,
        teamId: player?.teamId,
      });
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
    // Later drives (post-touchdown, second half) enter setup WITHOUT the
    // coin flip, so this flag was never turned back on — leaving pointer
    // input routed to the gameplay controller (movement pins during setup)
    // and checkSetupCompleteness returning early (setup unconfirmable)
    this.isSetupActive = true;

    const dugout = this.dugouts.get(activeTeam.id);
    const sprites = dugout ? dugout.getSprites() : new Map();
    this.placementController.enablePlacement(activeTeam, isTeam1, sprites);

    // Placed players stay movable until setup is confirmed
    this.repositionTeam = activeTeam;
    this.applyPitchRepositioning();
  }

  /**
   * Online: the opponent is setting up (or this coach has finished). Strip all
   * placement interaction so the board is view-only — no dugout drag, no
   * repositioning of placed players, no setup-zone highlight. The board still
   * renders via UI_SyncBoard; placement re-enables when it's this coach's turn.
   */
  /**
   * Online watcher: reconcile every sprite's status visual (prone/stunned/
   * off-pitch) to the authoritative player state, without moving anything.
   * Fixes status desync (a player down on one screen, up on the other) when a
   * status-change event was missed. Position-safe, so callable during play.
   */
  public syncPlayerStatuses(): void {
    this.playerSprites.forEach((sprite) => {
      const player = sprite.getPlayer();
      if (player.gridPosition) {
        sprite.updateStatus();
      } else {
        // In the dugout / KO'd / injured — no pitch presence
        sprite.setVisible(false);
      }
    });
  }

  public disableSetupInteraction(): void {
    this.isSetupActive = false;
    this.repositionTeam = null;
    // Broadcast-driven phase changes can arrive before controllers exist
    if (this.placementController) this.placementController.disablePlacement();
    this.applyPitchRepositioning(); // team=null → every sprite loses drag
    if (this.pitch) this.pitch.clearHighlights();
  }

  /**
   * During setup, already-placed players of the active team can be dragged
   * to a new square (or rearranged after loading a premade formation).
   * Cleared when setup ends.
   */
  private repositionTeam: Team | null = null;

  /**
   * Solid Defence reuses the familiar setup drag gesture, but the player
   * stays on the pitch for the whole operation. The event manager validates
   * the drop and only a successful authoritative move spends the allowance.
   */
  public setKickoffSolidDefenceDragPlayers(playerIds: string[]): void {
    if (this.isSetupActive) return;
    const eligible = new Set(playerIds);

    this.playerSprites.forEach((sprite, playerId) => {
      sprite.off("dragstart");
      sprite.off("drag");
      sprite.off("dragend");

      if (!eligible.has(playerId)) {
        sprite.disableInteractive();
        return;
      }

      sprite.setInteractive(
        centeredHitArea(sprite, GameConfig.SQUARE_SIZE),
        Phaser.Geom.Rectangle.Contains
      );
      this.input.setDraggable(sprite);

      sprite.on("dragstart", () => {
        sprite.setDepth(100);
      });
      sprite.on(
        "drag",
        (_pointer: Phaser.Input.Pointer, dragX: number, dragY: number) => {
          sprite.setPosition(dragX, dragY);
        }
      );
      sprite.on("dragend", () => {
        sprite.setDepth(10);
        const matrix = sprite.getWorldTransformMatrix();
        const pitchContainer = this.pitch.getContainer();
        const grid = pixelToGrid(
          matrix.tx - pitchContainer.x,
          matrix.ty - pitchContainer.y,
          GameConfig.SQUARE_SIZE
        );
        const moved = this.gameService.placeKickoffEventPlayer(
          playerId,
          grid.x,
          grid.y
        );
        if (!moved) {
          this.eventBus.emit(
            GameEventNames.UI_Notification,
            "Solid Defence: drag to a different legal empty setup square."
          );
        }
        // Local games have already changed authoritative state; online guests
        // snap to their current state until the host's synchronized result
        // arrives. Invalid drops always return to the original square.
        this.placePlayersOnPitch();
      });
    });
  }

  private applyPitchRepositioning(): void {
    const team = this.repositionTeam;
    this.playerSprites.forEach((sprite) => {
      const player = sprite.getPlayer();
      sprite.off("dragstart");
      sprite.off("drag");
      sprite.off("dragend");
      if (!team || player.teamId !== team.id || !this.isSetupActive) {
        sprite.disableInteractive();
        return;
      }

      sprite.setInteractive(
        centeredHitArea(sprite, GameConfig.SQUARE_SIZE),
        Phaser.Geom.Rectangle.Contains
      );
      this.input.setDraggable(sprite);

      // Hover shows the info panel the same way the dugout does; it clears
      // on pointer-out during play, but setup keeps the last-shown player
      // until another is inspected (see PlayerInfoPanel).
      sprite.on("pointerover", () => {
        this.eventBus.emit(GameEventNames.UI_ShowPlayerInfo, player);
      });
      sprite.on("pointerout", () => {
        this.eventBus.emit(GameEventNames.UI_HidePlayerInfo);
      });

      sprite.on("dragstart", () => {
        sprite.setDepth(100);
        // Reuses the placement controller's selection funnel so drag-start
        // shows this player's info exactly like a dugout drag would.
        this.placementController.selectPlayer(player.id);
      });
      sprite.on(
        "drag",
        (_pointer: Phaser.Input.Pointer, dragX: number, dragY: number) => {
          sprite.setPosition(dragX, dragY);
        }
      );
      sprite.on("dragend", () => {
        sprite.setDepth(10);
        const matrix = sprite.getWorldTransformMatrix();
        const pitchContainer = this.pitch.getContainer();
        const grid = pixelToGrid(
          matrix.tx - pitchContainer.x,
          matrix.ty - pitchContainer.y,
          GameConfig.SQUARE_SIZE
        );
        const moved = this.placementController.placePlayer(
          player.id,
          grid.x,
          grid.y
        );
        if (!moved) {
          if (!this.placementController.isInSetupZone(grid.x, grid.y)) {
            // Dropped outside the setup zone: back to the dugout
            this.placementController.removePlayer(player.id);
          } else {
            // e.g. occupied square: snap back to the current placement
            this.placePlayersOnPitch();
          }
        }
      });
    });
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
        this.placementController.syncFromTeam();
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

    this.placementController.on(
      GameEventNames.PlacementInvalid,
      (data: { reason: string }) => {
        this.eventBus.emit(GameEventNames.UI_Notification, data.reason);
        this.placementController.syncFromTeam();
        this.refreshDugouts();
      }
    );

    // Setup player inspection: the controller resolves the full player on
    // selection/drag-start; forward it to the shared bus so PlayerInfoPanel
    // (which only listens on the scene's eventBus) receives it.
    this.placementController.on(
      GameEventNames.UI_ShowPlayerInfo,
      (player: Player) => {
        this.eventBus.emit(GameEventNames.UI_ShowPlayerInfo, player);
      }
    );
  }

  public refreshDugouts(): void {
    if (!this.isSceneLive("refreshDugouts")) return;
    this.dugouts.forEach((d) => d.refresh());
    this.placePlayersOnPitch();
  }

  public startPlayPhase(): void {
    this.isSetupActive = false;
    this.repositionTeam = null;
    this.applyPitchRepositioning(); // strip setup drag handlers
    this.pitch.clearHighlights(); // Clear setup zones
    this.eventBus.emit(GameEventNames.UI_HideSetupControls);

    // Ensure all players are placed
    this.placePlayersOnPitch();
  }

  public startKickoffPhase(subPhase?: SubPhase): void {
    this.isSetupActive = false;
    this.repositionTeam = null;
    this.applyPitchRepositioning(); // strip setup drag handlers
    this.pitch.clearHighlights();
    this.eventBus.emit(GameEventNames.UI_HideSetupControls);

    // Ensure players are visible and correct
    this.placePlayersOnPitch();

    // Logic based on subphase
    if (subPhase === SubPhase.ROLL_KICKOFF) {
      this.eventBus.emit(
        GameEventNames.UI_Notification,
        "Select Kicker & Target"
      );
    }
  }

  protected placePlayersOnPitch(): void {
    if (!this.isSceneLive("placePlayersOnPitch")) return;
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

    // Newly created sprites during setup need the reposition drag handlers
    if (this.isSetupActive && this.repositionTeam) {
      this.applyPitchRepositioning();
    }

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

  /**
   * Animate the ball along a grid path in lockstep with a carrying player's
   * movement animation (same 180ms linear steps as PlayerSprite). Without
   * this the BallPlaced events teleport the ball to the destination before
   * the player sprite even starts walking. `delayMs` holds the ball on its
   * start square until the walking player reaches it (mid-path pickups).
   */
  public animateBallAlong(
    from: { x: number; y: number },
    path: { x: number; y: number }[],
    delayMs: number = 0
  ): void {
    if (!this.ballSprite || path.length === 0) return;

    const startPx = this.pitch.getPixelPosition(from.x, from.y);
    this.ballSprite.setPosition(startPx.x, startPx.y);

    const tweenConfigs = path.map((step) => {
      const px = this.pitch.getPixelPosition(step.x, step.y);
      return { x: px.x, y: px.y, duration: 180, ease: "Linear" };
    });

    this.tweens.chain({
      targets: this.ballSprite,
      delay: delayMs,
      tweens: tweenConfigs,
    });
  }

  /**
   * Move THE ball visual to a square. Idempotent by construction: the scene
   * owns at most one BallSprite, which is repositioned (and its in-flight
   * tweens cancelled) rather than destroyed and recreated, so no code path
   * can leave a second ball behind.
   */
  protected placeBallVisual(x: number, y: number): void {
    // A BallKicked delivered to a shut-down scene is what crashed the second
    // match of a session (`new BallSprite` on a null `sys`).
    if (!this.isSceneLive("placeBallVisual")) return;

    // Use WORLD coordinates (same as players) since ball will be in scene root
    const pos = this.pitch.getPixelPosition(x, y);

    if (this.ballSprite?.active) {
      this.tweens.killTweensOf(this.ballSprite);
      this.ballSprite.setPosition(pos.x, pos.y);
      // Reset the airborne/kickoff treatment so a re-used ball looks the same
      // as a freshly created one.
      this.ballSprite.setScale(0.5);
      this.ballSprite.setAlpha(1);
      this.ballSprite.setVisible(true);
    } else {
      this.ballSprite = new BallSprite(this, pos.x, pos.y);
    }

    // CRITICAL: Add ball to SCENE ROOT (not pitch container)
    // This puts it in the same rendering context as players
    // Players are at depth 10, so ball at depth 100 will render on top
    this.ballSprite.setDepth(100);
  }

  /**
   * Reconcile the ball visual and every carrier marker to the single
   * representation derived from canonical state. Safe to call any number of
   * times: exactly one ball visual survives and exactly one player (or none)
   * is marked as the carrier.
   */
  public reconcileBallVisual(): void {
    const players = [...this.team1.players, ...this.team2.players];
    const ball = resolveBallRepresentation(this.gameService.getState(), players);

    if (ball.kind === "none") {
      this.ballSprite?.destroy();
      this.ballSprite = null;
    } else {
      // Exactly one ball visual, at the one possession square — whether that
      // square is empty (loose) or occupied by the carrier.
      this.placeBallVisual(ball.square.x, ball.square.y);
    }

    const carrierId = ball.kind === "carried" ? ball.playerId : null;
    this.playerSprites.forEach((sprite, playerId) => {
      sprite.setCarryingBall(playerId === carrierId);
    });
  }

  /**
   * Reconcile pitch/dugout presentation from `resolvePlayerLocation` — the one
   * function that owns "where is this player represented". A player resolved
   * into a dugout box loses their pitch sprite immediately, even if some rule
   * path left a stale grid position behind.
   */
  public reconcilePlayerLocations(): void {
    [...this.team1.players, ...this.team2.players].forEach((player) =>
      this.reconcilePlayerLocation(player.id, true)
    );
    this.dugouts.forEach((dugout) => dugout.refresh());
  }

  /**
   * Reconcile one player's pitch/dugout presentation. `reposition` is opt-in:
   * during play a status change must not snap a mid-animation mover back to
   * their grid square, but a player who has left the pitch must disappear from
   * it immediately (KO, casualty, sent off).
   */
  public reconcilePlayerLocation(playerId: string, reposition = false): void {
    const player = this.gameService.getPlayerById(playerId);
    const sprite = this.playerSprites.get(playerId);
    if (!player || !sprite) return;

    const location = resolvePlayerLocation(player);
    if (location.kind !== "pitch") {
      sprite.setCarryingBall(false);
      sprite.setVisible(false);
      this.dugouts.forEach((dugout) => dugout.refresh());
      return;
    }

    if (reposition) {
      const pos = this.pitch.getPixelPosition(
        location.square.x,
        location.square.y
      );
      sprite.setPosition(pos.x, pos.y);
    }
    sprite.updateStatus();
  }

  /**
   * Reapply the activated (dimmed) treatment from current-turn state. Only
   * players resolved onto the pitch are touched: clearing the treatment falls
   * back to the status visual, which would otherwise make a dugout player's
   * sprite visible again.
   */
  public reconcileActivationStyling(): void {
    const state = this.gameService.getState();
    this.playerSprites.forEach((sprite, playerId) => {
      const player = this.gameService.getPlayerById(playerId);
      if (!player || resolvePlayerLocation(player).kind !== "pitch") return;
      sprite.setActivated(isActivatedThisTurn(state, playerId));
    });
  }

  /**
   * Full-board reconciliation, used by restore/resume and any path that has
   * to rebuild presentation from state alone.
   */
  public reconcileBoard(): void {
    this.placePlayersOnPitch();
    this.reconcilePlayerLocations();
    this.reconcileBallVisual();
    this.reconcileActivationStyling();
    this.reportBoardStateConflicts();
  }

  /**
   * Diagnostic: surface any state that cannot be drawn unambiguously (two
   * balls, a player on the pitch and in a dugout box at once).
   */
  private reportBoardStateConflicts(): void {
    const conflicts = findBoardStateConflicts(this.gameService.getState(), [
      ...this.team1.players,
      ...this.team2.players,
    ]);
    if (conflicts.length) {
      console.warn("[GameScene] board state conflicts:", conflicts);
    }
  }

  // Interaction Helpers matched to Controller expectations
  public highlightPlayer(playerId: string, color: number = 0xffff00): void {
    const sprite = this.playerSprites.get(playerId);
    if (sprite) {
      sprite.highlight(color);
    }
  }

  public unhighlightPlayer(playerId: string): void {
    const sprite = this.playerSprites.get(playerId);
    if (sprite) {
      sprite.unhighlight();
    }
  }
}
