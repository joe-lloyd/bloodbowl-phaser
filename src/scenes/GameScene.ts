import Phaser from "phaser";
import { drawsFor } from "../game/presentation/screenSettled";
import { Pitch } from "../game/elements/Pitch";
import { PlayerSprite } from "../game/elements/PlayerSprite";
import { BallSprite } from "../game/elements/BallSprite";
import { Dugout } from "../game/elements/Dugout";
import { preloadStadium, Stadium } from "../game/elements/Stadium";
import { preloadPlayerArt } from "../game/presentation/playerArt";
import { Team, TeamColors } from "../types/Team";
import { ServiceContainer } from "../services/ServiceContainer";
import { IGameService } from "../services/interfaces/IGameService";
import { IEventBus } from "../services/EventBus";
import { SubPhase } from "../types/GameState";
import { GameEventNames } from "../types/events";
import { SetupValidator } from "../game/validators/SetupValidator";
import { FormationManager } from "../game/managers/FormationManager";
import { PlayerPlacementController } from "../game/controllers/PlayerPlacementController";
import { MovementValidator } from "../game/validators/MovementValidator";
import { GameplayInteractionController } from "../game/controllers/GameplayInteractionController";
import { SceneOrchestrator } from "../game/controllers/SceneOrchestrator";
import { CameraController } from "../game/controllers/CameraController";
import { TouchController } from "../game/controllers/TouchController";
import {
  measureHudRects,
  watchHudPanels,
} from "../game/presentation/hudRects";
import {
  DEFAULT_PITCH_THEME_ID,
  PitchThemeId,
} from "../game/presentation/pitchThemes";
import { CompetitionContext } from "../competition/types";
import { MatchAutosave } from "../game/persistence/MatchAutosave";
import { kitOf } from "../game/presentation/kits";
import {
  ensureMatchServices,
  GameSceneData,
  resolveMatchStart,
  startAutosave,
} from "./matchStart";
import { followMatchWithCamera } from "./matchCamera";
import * as board from "./boardSprites";
import { subscribeBoardEvents, subscribeTurnMarkers } from "./boardEvents";
import { wirePointerInput, wireTouchInput } from "./boardInput";
import {
  applyPitchRepositioning,
  dragSolidDefencePlayers,
  listenToPlacement,
} from "./setupPlacement";

/**
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
  private touchController: TouchController | null = null;

  // Services
  protected gameService!: IGameService;
  protected eventBus!: IEventBus;

  // State
  private playerSprites: Map<string, PlayerSprite> = new Map();
  /** Online only: which player the OTHER coach currently has selected. */
  private remoteSelectedPlayerId: string | null = null;
  public isSetupActive: boolean = false;
  protected ballSprite: BallSprite | null = null;
  private pitchThemeId: PitchThemeId = DEFAULT_PITCH_THEME_ID;
  private competitionContext?: CompetitionContext;
  private autosave: MatchAutosave | null = null;
  private resumedMatch = false;
  private autosaveEnabled = false;

  // Store handlers for cleanup
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

  init(data: GameSceneData): void {
    const start = resolveMatchStart(data, this.sys.settings.key);
    this.team1 = start.team1;
    this.team2 = start.team2;
    this.pitchThemeId = start.pitchThemeId;
    this.competitionContext = start.competitionContext;
    this.resumedMatch = start.resumed;
    this.autosaveEnabled = start.autosaveEnabled;
    this.kickingTeam = start.kickingTeam;
    this.receivingTeam = start.receivingTeam;

    ensureMatchServices(start, data.progressionEnabled);

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
      home: this.kitOf(this.team1.id).primary,
      away: this.kitOf(this.team2.id).primary,
    });
    wirePointerInput(this);

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

    this.initializeControllers();

    // A panel that opens after the camera framed, such as the action menu
    // once a player is selected, frames the squares again clear of it
    const panels = watchHudPanels(() =>
      this.cameraController.refreshFraming()
    );
    this.busSubscriptions.push(() => panels.stop());
    this.cameraController = new CameraController(
      this,
      this.pitch,
      { width: this.stadium.width, height: this.stadium.height },
      Array.from(this.dugouts.values()).flatMap((d) => d.getBounds()),
      this.eventBus,
      this.pitchThemeId,
      () => {
        // The HUD may mount after the board: pick up its panels as they come
        panels.watch();
        return measureHudRects(this.game.canvas, this.scale.width);
      }
    );

    this.touchController = wireTouchInput(this);

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

    if (this.autosaveEnabled) this.autosave = startAutosave(this);

    subscribeTurnMarkers(this);
    followMatchWithCamera(this);

    // The board is built: the loading screen can go, as the camera comes in.
    this.eventBus.emit(GameEventNames.UI_LoadProgress, { progress: 1 });
    if (!this.resumedMatch) this.cameraController.intro();

    // A coach the page plays waits for the board to finish drawing a step
    this.busSubscriptions.push(
      drawsFor(this.eventBus, () =>
        Promise.all([
          ...[...this.playerSprites.values()].map((sprite) => sprite.motion),
          this.ballSprite?.arrived(),
        ])
      )
    );

    // Cleanup on scene shutdown
    this.events.on(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);
    this.events.on(Phaser.Scenes.Events.DESTROY, this.shutdown, this);
  }

  private shutdown(): void {
    this.stadium?.destroy();
    this.autosave?.dispose();
    this.autosave = null;
    // Remove all listeners attached by this scene
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

    this.touchController?.destroy();
    this.touchController = null;

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
        this.kitOf(team.id),
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
      this.validator,
      (playerId) => this.gameService.isSetupEligible(playerId),
      (teamId) => {
        const status = this.gameService.getSetupStatus(teamId);
        return status?.swarming
          ? {
              minimum: status.requiredPlayerCount,
              maximum:
                status.requiredPlayerCount +
                status.swarming.maximumAdditionalPlayers,
            }
          : undefined;
      }
    );

    subscribeBoardEvents(this);
  }

  // Start setup phase - can be overridden by subclasses (e.g., SandboxScene)
  /** The coin toss is up; SetupPhaseHandler shows it. */
  public startSetupPhase(): void {
    this.isSetupActive = true;
  }

  /** A team's players in the dugout cheer, for its introduction. */
  public celebrateDugout(teamId: string): Promise<void> {
    return this.dugouts.get(teamId)?.animateCelebration() ?? Promise.resolve();
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
    applyPitchRepositioning(this);
  }

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

  /**
   * Online: the opponent is setting up (or this coach has finished). Strip all
   * placement interaction so the board is view-only — no dugout drag, no
   * repositioning of placed players, no setup-zone highlight. The board still
   * renders via UI_SyncBoard; placement re-enables when it's this coach's turn.
   */
  public disableSetupInteraction(): void {
    this.isSetupActive = false;
    this.repositionTeam = null;
    // Broadcast-driven phase changes can arrive before controllers exist
    if (this.placementController) this.placementController.disablePlacement();
    applyPitchRepositioning(this); // team=null → every sprite loses drag
    if (this.pitch) this.pitch.clearHighlights();
  }

  /**
   * During setup, already-placed players of the active team can be dragged
   * to a new square (or rearranged after loading a premade formation).
   * Cleared when setup ends.
   */
  private repositionTeam: Team | null = null;

  /** Solid Defence: these players may be dragged to a new setup square. */
  public setKickoffSolidDefenceDragPlayers(playerIds: string[]): void {
    dragSolidDefencePlayers(this, playerIds);
  }

  /**
   * Whether a drop the service accepted should stay as it is until the
   * engine answers. Against the computer and online the engine runs the
   * command a moment later, and until then the record still has the player
   * on the square they left: redrawing now drew them back there for a frame
   * before they jumped to the new square. The answer redraws the board, and
   * so does a refusal (NetworkCommandRejected), which puts the player back.
   */
  private awaitsEngine(accepted: boolean): boolean {
    return accepted && this.gameService.runsCommandsLater === true;
  }

  private setupSceneSpecificListeners(): void {
    listenToPlacement(this);
  }

  public refreshDugouts(): void {
    if (!this.isSceneLive("refreshDugouts")) return;
    this.dugouts.forEach((d) => d.refresh());
    if (this.isSetupActive) {
      // The placement controller checks drops against its own map of who
      // stands where. Against the computer and online the engine's answer
      // lands here (UI_SyncBoard), after the drop handler last synced it:
      // without this the map stays one move behind, and a reserve just
      // placed is missing from it, so dropping them outside the zone did
      // not send them back to the dugout.
      this.placementController?.syncFromTeam();
      // A player who first enters the dugout during setup gets a new sprite,
      // picked by its figure; setup picks by square
      this.placementController?.applySetupHitAreas();
    }
    this.placePlayersOnPitch();
  }

  public startPlayPhase(): void {
    this.isSetupActive = false;
    this.repositionTeam = null;
    applyPitchRepositioning(this); // strip setup drag handlers
    this.placementController?.restoreFigureHitAreas();
    this.pitch.clearHighlights(); // Clear setup zones
    this.eventBus.emit(GameEventNames.UI_HideSetupControls);

    // Ensure all players are placed
    this.placePlayersOnPitch();
  }

  public startKickoffPhase(subPhase?: SubPhase): void {
    this.isSetupActive = false;
    this.repositionTeam = null;
    applyPitchRepositioning(this); // strip setup drag handlers
    this.placementController?.restoreFigureHitAreas();
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
    board.placePlayersOnPitch(this);
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

  /** What a team wears in this match: a clashing away side changes kit. */
  private kitOf(teamId: string): TeamColors {
    return kitOf([this.team1, this.team2], teamId);
  }

  /** Resolves once the player's walk on screen has finished. */
  public playerSettled(playerId: string): Promise<void> {
    return this.playerSprites.get(playerId)?.motion ?? Promise.resolve();
  }

  /** Walk the ball along a path with the player carrying it. */
  public animateBallAlong(
    from: { x: number; y: number },
    path: { x: number; y: number }[],
    delayMs: number = 0
  ): void {
    board.animateBallAlong(this, from, path, delayMs);
  }

  /** Move THE ball visual to a square: there is only ever one. */
  protected placeBallVisual(x: number, y: number, height = 0): void {
    board.placeBallVisual(this, x, y, height);
  }

  /** Draw the ball and the carrier marker from the game state. */
  public reconcileBallVisual(): void {
    board.reconcileBallVisual(this);
  }

  /** Show one player on the pitch or in the dugout, from the game state. */
  public reconcilePlayerLocation(playerId: string, reposition = false): void {
    board.reconcilePlayerLocation(this, playerId, reposition);
  }

  /** Redraw the whole board from the game state, as after a restore. */
  public reconcileBoard(): void {
    board.reconcileBoard(this);
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
