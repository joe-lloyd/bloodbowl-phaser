import Phaser from "phaser";
import { Pitch } from "../game/elements/Pitch";
import { PlayerSprite } from "../game/elements/PlayerSprite";
import { BallSprite, CARRIED_HEIGHT } from "../game/elements/BallSprite";
import { Dugout } from "../game/elements/Dugout";
import { playerHitArea } from "../game/elements/InteractiveHitArea";
import { preloadStadium, Stadium } from "../game/elements/Stadium";
import { preloadPlayerArt } from "../game/presentation/playerArt";
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
import { MovementValidator } from "../game/validators/MovementValidator";
import { GameplayInteractionController } from "../game/controllers/GameplayInteractionController";
import { SceneOrchestrator } from "../game/controllers/SceneOrchestrator";
import { CameraController } from "../game/controllers/CameraController";
import {
  DEFAULT_PITCH_THEME_ID,
  PitchThemeId,
  resolvePitchTheme,
} from "../game/presentation/pitchThemes";
import {
  createMatchSave,
  MatchSave,
  restoreMatchSave,
} from "../headless/serialization";
import { CompetitionContext } from "../competition/types";
import { MatchAutosave } from "../game/persistence/MatchAutosave";
import { getActiveOnlineMatch } from "../network/OnlineMatch";
import {
  findBoardStateConflicts,
  isActivatedThisTurn,
  resolveBallRepresentation,
  resolvePlayerLocation,
} from "../game/presentation/boardState";

/**
 * Game Scene - Unified scene for Setup and Gameplay
 * Game Scene - Unified scene for Setup and Gameplay
 */
export class GameScene extends Phaser.Scene {
  private pitch!: Pitch;
  private stadium!: Stadium;

  /**
   * The live pitch, for anything that must map grid squares to canvas
   * coordinates through the same geometry the game renders with — the E2E
   * pitch page object reads this so its clicks land where the game thinks
   * the square is, rather than on a second copy of the arithmetic.
   */
  public getPitch(): Pitch | undefined {
    return this.pitch;
  }

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
  /** Online only: which player the OTHER coach currently has selected. */
  private remoteSelectedPlayerId: string | null = null;
  public isSetupActive: boolean = false;
  protected ballSprite: BallSprite | null = null;
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
    // Only the art this match needs: the stadium in the chosen style and the
    // models for both rosters. Progress drives the loading screen.
    preloadStadium(this, this.pitchThemeId);
    preloadPlayerArt(
      this,
      this.pitchThemeId,
      [this.team1, this.team2].flatMap((team) =>
        team.players.map((p) => ({
          rosterName: team.rosterName,
          positionName: p.positionName,
        }))
      )
    );
    this.load.on(Phaser.Loader.Events.PROGRESS, (progress: number) =>
      this.eventBus?.emit(GameEventNames.UI_LoadProgress, { progress })
    );
  }

  create(): void {
    // 1. The stadium, with team 1 as home (left end zone, far dugout).
    this.stadium = new Stadium(this, this.pitchThemeId, {
      home: this.team1.colors.primary,
      away: this.team2.colors.primary,
    });

    // A click on nothing deselects. Behind everything, over the whole stadium.
    this.add
      .rectangle(0, 0, this.stadium.width, this.stadium.height, 0x000000, 0)
      .setOrigin(0)
      .setDepth(-1)
      .setInteractive()
      .on("pointerdown", (pointer: Phaser.Input.Pointer) => {
        // Squares on the pitch belong to the gameplay controller; only a
        // click in the stands or the surrounds deselects.
        const square = this.pitch.worldToGrid(pointer.worldX, pointer.worldY);
        if (!this.pitch.isOnPitch(square)) this.onBackgroundClick();
      });

    // 2. The overlay layer, anchored on the far corner of square (0, 0).
    const origin = this.stadium.origin;
    this.pitch = new Pitch(this, origin.x, origin.y);

    this.createDugouts();

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
        const gridPos = this.pitch.worldToGrid(pointer.worldX, pointer.worldY);
        if (this.pitch.isOnPitch(gridPos)) {
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

    this.cameraController = new CameraController(
      this,
      this.pitch,
      { width: this.stadium.width, height: this.stadium.height },
      Array.from(this.dugouts.values()).flatMap((d) => d.getBounds()),
      this.eventBus,
      this.pitchThemeId
    );

    // Camera keyboard shortcuts: 0 or 1 hands the camera back, on the overview.
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
      // Reset all sprites and mark the active team with square borders.
      // Online only: never show the blanket "active team" white square for
      // a team the local coach doesn't control — that's replaced by the
      // single-player remote-selection red ring (see RemoteSelectionChanged).
      const onlineMatch = getActiveOnlineMatch();
      this.playerSprites.forEach((sprite) => {
        sprite.setActivated(false);
        const isMyTeam =
          !onlineMatch || sprite.getPlayer().teamId === onlineMatch.myTeamId;
        sprite.setTeamTurnBorder(
          sprite.getPlayer().teamId === turnData.teamId && isMyTeam
        );
      });
      // Reset selection
      this.gameplayController.deselectPlayer();
      // A stale remote-selection ring (opponent disconnected mid-selection,
      // or the turn simply ended without a drive-ending RefreshBoard) must
      // not persist into the new turn.
      this.setRemoteSelection(null);
    });

    // Online only: show a live indicator of which single opposing player
    // the other coach currently has selected, in place of the blanket
    // whole-team highlight suppressed above.
    this.subscribe(GameEventNames.RemoteSelectionChanged, ({ playerId }) => {
      this.setRemoteSelection(playerId);
    });

    // The match camera follows the game: see CameraController.
    this.subscribe(GameEventNames.Camera_TrackBall, ({ playerId }) => {
      const target = playerId
        ? this.playerSprites.get(playerId)
        : this.ballSprite;
      if (target) this.cameraController.follow(target);
    });
    this.subscribe(GameEventNames.Camera_Reset, (data) => {
      this.cameraController.reset(data.duration || 800);
    });
    this.subscribe(GameEventNames.PlayerSelected, ({ player }) => {
      if (!player?.gridPosition || this.isSetupActive) return;
      this.cameraController.release();
      // The kicker aims anywhere in the other half: keep it all in view
      if (this.gameService.getPhase() === GamePhase.KICKOFF) {
        this.cameraController.overview();
        return;
      }
      this.cameraController.focusSquare(
        player.gridPosition.x,
        player.gridPosition.y
      );
    });
    this.subscribe(GameEventNames.PlayerMoved, ({ to }) => {
      if (this.isSetupActive) return;
      this.cameraController.focusSquare(to.x, to.y, 900);
    });
    this.subscribe(GameEventNames.PhaseChanged, ({ phase }) => {
      // Setup wants both benches in view for dragging players on.
      if (phase === GamePhase.SETUP) this.cameraController.reset();
    });
    // A loaded scenario or a resumed match shows the whole board first; the
    // turn start that follows the restore keeps the overview
    let restored = false;
    this.subscribe(GameEventNames.GameStateRestored, () => {
      restored = true;
    });
    // A new turn frames the acting team with the ball, so every player the
    // coach may move is in view (the ball alone left the team off screen
    // when it lay in the other half)
    this.subscribe(GameEventNames.TurnStarted, ({ teamId }) => {
      this.cameraController.release();
      if (restored) {
        restored = false;
        this.cameraController.overview();
        return;
      }
      const ball = resolveBallRepresentation(this.gameService.getState(), [
        ...this.team1.players,
        ...this.team2.players,
      ]);
      const acting = [...this.team1.players, ...this.team2.players]
        .filter((p) => p.teamId === teamId && p.gridPosition)
        .map((p) => p.gridPosition!);
      const squares = ball.kind === "none" ? acting : [...acting, ball.square];
      if (squares.length === 0) this.cameraController.overview();
      else this.cameraController.focusSquares(squares);
    });

    // The board is built: the loading screen can go, as the camera comes in.
    this.eventBus.emit(GameEventNames.UI_LoadProgress, { progress: 1 });
    if (!this.resumedMatch) this.cameraController.intro();

    // Cleanup on scene shutdown
    this.events.on(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);
    this.events.on(Phaser.Scenes.Events.DESTROY, this.shutdown, this);
  }

  private shutdown(): void {
    this.stadium?.destroy();
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

  /**
   * The two benches, on the stadium's dugout squares: team 1 in the home
   * dugout on the far touchline, team 2 in the away one on the near side.
   * Each faces the pitch.
   */
  private createDugouts(): void {
    if (!this.isSceneLive("createDugouts")) return;
    const toWorld = (gx: number, gy: number) =>
      this.pitch.getPointPosition(gx, gy);
    const benches = [
      [this.team1, this.stadium.meta.dugouts.home, "s"],
      [this.team2, this.stadium.meta.dugouts.away, "n"],
    ] as const;
    for (const [team, squares, facing] of benches) {
      const dugout = new Dugout(
        this,
        team,
        squares,
        toWorld,
        this.pitchThemeId,
        facing
      );
      dugout.setDragCallbacks(
        (id) => this.onDugoutDragStart(id),
        (id, x, y) => this.onDugoutDragEnd(id, x, y)
      );
      this.dugouts.set(team.id, dugout);
    }
  }

  /**
   * Recreate both dugouts against the CURRENT team objects. A scenario load
   * swaps this.team1/this.team2 for new rosters (new team ids), leaving the
   * existing dugouts pointing at the old teams — so a plain refresh keeps
   * rendering the previous roster's reserves. Rebuild to follow the swap.
   */
  private rebuildDugouts(): void {
    this.dugouts.forEach((d) => d.destroy());
    this.dugouts.clear();
    this.createDugouts();
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
      this.setRemoteSelection(null);
      this.refreshDugouts();
    });

    // Online: a snapshot arrived — reconcile the board to authoritative state.
    // In setup we do a full refresh (repositions from state). In play we only
    // reconcile status visuals (down/up/stunned/off-pitch): a full refresh
    // would snap a mid-animation mover to its grid square, but updateStatus
    // touches only alpha/angle/visibility, never position — so it's safe and
    // catches any status-change event the watcher missed. A resync asks for
    // positions as well: nothing is animating, and it may have rewound.
    this.subscribe(GameEventNames.UI_SyncBoard, (data) => {
      if (this.gameService.getPhase() === GamePhase.SETUP) {
        this.refreshDugouts();
        return;
      }
      if (data?.positions) {
        this.refreshDugouts();
        const ball = this.gameService.getState().ballPosition;
        if (ball) this.placeBallVisual(ball.x, ball.y);
      }
      this.syncPlayerStatuses();
    });

    // Online: the other coach's move, drawn as one line while the player
    // runs it, then cleared
    let otherMoveTimer: ReturnType<typeof setTimeout> | null = null;
    this.subscribe(GameEventNames.UI_ShowOtherCoachMove, ({ from, path, ma }) => {
      this.pitch.drawMovementPath([from, ...path], [], ma);
      if (otherMoveTimer) clearTimeout(otherMoveTimer);
      otherMoveTimer = setTimeout(
        () => this.pitch.clearPath(),
        600 + path.length * 350
      );
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
        playerHitArea(sprite),
        Phaser.Geom.Rectangle.Contains
      );
      this.input.setDraggable(sprite);

      sprite.on("dragstart", () => {
        sprite.setDepth(10_000);
      });
      sprite.on(
        "drag",
        (_pointer: Phaser.Input.Pointer, dragX: number, dragY: number) => {
          sprite.setPosition(dragX, dragY);
        }
      );
      sprite.on("dragend", () => {
        const grid = this.pitch.worldToGrid(sprite.x, sprite.y);
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
        playerHitArea(sprite),
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
        sprite.setDepth(10_000);
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
        const grid = this.pitch.worldToGrid(sprite.x, sprite.y);
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
      } else {
        const isTeam1 = player.teamId === this.team1.id;
        const team = isTeam1 ? this.team1 : this.team2;
        // Each side faces the end zone it attacks.
        const sprite = new PlayerSprite(this, pos.x, pos.y, player, {
          rosterName: team.rosterName,
          colors: team.colors,
          style: this.pitchThemeId,
          facing: isTeam1 ? "e" : "w",
        });
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
      const gridPos = this.pitch.worldToGrid(x, y);
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
      return { x: px.x, y: px.y, duration: 200, ease: "Linear" };
    });

    const ball = this.ballSprite;
    this.tweens.chain({
      targets: ball,
      delay: delayMs,
      tweens: tweenConfigs.map((t) => ({
        ...t,
        // Keep depth sorting with the carrier as the ball moves.
        onUpdate: () => ball.setHeight(ball.altitude),
      })),
    });
  }

  /**
   * Move THE ball visual to a square. Idempotent by construction: the scene
   * owns at most one BallSprite, which is repositioned (and its in-flight
   * tweens cancelled) rather than destroyed and recreated, so no code path
   * can leave a second ball behind.
   */
  protected placeBallVisual(x: number, y: number, height = 0): void {
    // A BallKicked delivered to a shut-down scene is what crashed the second
    // match of a session (`new BallSprite` on a null `sys`).
    if (!this.isSceneLive("placeBallVisual")) return;

    // Use WORLD coordinates (same as players) since ball will be in scene root
    const pos = this.pitch.getPixelPosition(x, y);

    if (this.ballSprite?.active) {
      this.tweens.killTweensOf(this.ballSprite);
      this.ballSprite.stopFlight();
      this.ballSprite.setPosition(pos.x, pos.y);
      // A re-used ball looks the same as a fresh one: no kick-off fade.
      this.ballSprite.setAlpha(1);
      this.ballSprite.setVisible(true);
    } else {
      this.ballSprite = new BallSprite(this, pos.x, pos.y);
    }
    this.ballSprite.setHeight(height);
  }

  /**
   * Reconcile the ball visual and every carrier marker to the single
   * representation derived from canonical state. Safe to call any number of
   * times: exactly one ball visual survives and exactly one player (or none)
   * is marked as the carrier.
   */
  public reconcileBallVisual(): void {
    const players = [...this.team1.players, ...this.team2.players];
    const ball = resolveBallRepresentation(
      this.gameService.getState(),
      players
    );

    if (ball.kind === "none") {
      this.ballSprite?.destroy();
      this.ballSprite = null;
    } else {
      // Exactly one ball visual, at the one possession square — whether that
      // square is empty (loose) or occupied by the carrier.
      this.placeBallVisual(
        ball.square.x,
        ball.square.y,
        ball.kind === "carried" ? CARRIED_HEIGHT : 0
      );
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

  /**
   * Online only: move the remote-selection red ring to whichever player the
   * other coach currently has selected (or clear it). Independent of local
   * selection highlighting — see PlayerSprite.setRemoteSelected.
   */
  public setRemoteSelection(playerId: string | null): void {
    if (
      this.remoteSelectedPlayerId &&
      this.remoteSelectedPlayerId !== playerId
    ) {
      this.playerSprites
        .get(this.remoteSelectedPlayerId)
        ?.setRemoteSelected(false);
    }
    this.remoteSelectedPlayerId = playerId;
    if (playerId) {
      this.playerSprites.get(playerId)?.setRemoteSelected(true);
    }
  }
}
