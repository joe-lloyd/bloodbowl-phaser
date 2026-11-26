import Phaser from "phaser";
import { drawsFor } from "../game/presentation/screenSettled";
import { Pitch } from "../game/elements/Pitch";
import { PlayerSprite } from "../game/elements/PlayerSprite";
import { BombSprite } from "../game/elements/BombSprite";
import { BallSprite } from "../game/elements/BallSprite";
import { Dugout } from "../game/elements/Dugout";
import { SidelineTerrace } from "../game/elements/SidelineTerrace";
import { preloadSidelineArt } from "../game/elements/SidelineStaffSprite";
import {
  createVenueBackdrop,
  preloadVenue,
  type VenueBackdrop,
} from "../game/elements/venue/backdrop";
import { modelFor, preloadPlayerArt } from "../game/presentation/playerArt";
import { preloadLooks } from "../game/presentation/layered/lookTextures";
import { appearanceOf } from "../game/names/playerIdentity";
import { type Team, type TeamColors } from "../types/Team";
import { GameConfig } from "../config/GameConfig";
import { ServiceContainer } from "../services/ServiceContainer";
import { type IGameService } from "../services/interfaces/IGameService";
import { type IEventBus } from "../services/EventBus";
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
import { measureHudRects, watchHudPanels } from "../game/presentation/hudRects";
import { type CompetitionContext } from "../competition/types";
import { MatchAutosave } from "../game/persistence/MatchAutosave";
import { kitOf } from "../game/presentation/kits";
import {
  ensureMatchServices,
  type GameSceneData,
  resolveMatchStart,
  startAutosave,
  startDiceLog,
} from "./matchStart";
import { followMatchWithCamera } from "./matchCamera";
import { locateActionOnScreen } from "./actionOnScreen";
import { subscribeWallHits } from "./wallHitEffects";
import * as board from "./boardSprites";
import { subscribeBoardEvents, subscribeTurnMarkers } from "./boardEvents";
import { wirePointerInput, wireTouchInput } from "./boardInput";
import {
  applyPitchRepositioning,
  dragSolidDefencePlayers,
  listenToPlacement,
} from "./setupPlacement";

export class GameScene extends Phaser.Scene {
  public pitch!: Pitch;
  public venue!: VenueBackdrop;

  public getPitch(): Pitch | undefined {
    return this.pitch;
  }

  public team1!: Team;
  public team2!: Team;
  public kickingTeam!: Team;
  public receivingTeam!: Team;

  public dugouts = new Map<string, Dugout>();
  private staffTerraces: SidelineTerrace[] = [];

  private validator!: SetupValidator;
  public formationManager!: FormationManager;
  public placementController!: PlayerPlacementController;
  protected orchestrator!: SceneOrchestrator;

  private movementValidator!: MovementValidator;
  public gameplayController!: GameplayInteractionController;
  public cameraController!: CameraController;
  private touchController: TouchController | null = null;

  public gameService!: IGameService;
  public eventBus!: IEventBus;

  public playerSprites = new Map<string, PlayerSprite>();

  private raisedSprite: PlayerSprite | null = null;

  private remoteSelectedPlayerId: string | null = null;
  public isSetupActive = false;
  public ballSprite: BallSprite | null = null;
  public competitionContext: (CompetitionContext) | undefined;
  private autosave: MatchAutosave | null = null;
  private diceLog: { dispose(): void } | null = null;
  private resumedMatch = false;
  private autosaveEnabled = false;

  private busSubscriptions: (() => void)[] = [];

  public subscribe<
    K extends keyof import("../services/EventBus").GameEventMap,
  >(
    event: K,
    handler: (data: import("../services/EventBus").GameEventMap[K]) => void
  ): void {
    this.eventBus.on(event, handler);
    this.busSubscriptions.push(() => {
      this.eventBus.off(event, handler);
    });
  }

  public isSceneLive(where: string): boolean {
    const shutdown = Phaser.Scenes?.SHUTDOWN ?? 8;
    const status = this.sys?.settings?.status;
    if (status !== undefined && status < shutdown) return true;
    console.warn(
      `[GameScene] ${where} ignored: scene "${this.sys?.settings?.key ?? "GameScene"}" is no longer active`
    );
    return false;
  }

  public reloadState(clearPlayerPositions = true): void {
    const container = ServiceContainer.getInstance();
    this.gameService = container.gameService;
    this.eventBus = container.eventBus;

    this.playerSprites.forEach((s) => {
      s.destroy();
    });
    this.playerSprites.clear();
    this.raisedSprite = null;

    if (clearPlayerPositions) {
      for (const p of this.team1.players) {
        delete p.gridPosition;
      }
      for (const p of this.team2.players) {
        delete p.gridPosition;
      }
    }

    if (clearPlayerPositions && this.ballSprite) {
      this.ballSprite.destroy();
      this.ballSprite = null;
    }

    if (this.gameplayController) this.gameplayController.destroy();
    if (this.orchestrator) this.orchestrator.destroy();

    this.initializeControllers();

    this.gameplayController = new GameplayInteractionController(
      { scene: this,gameService: this.gameService,eventBus: this.eventBus,pitch: this.pitch,movementValidator: this.movementValidator }    );

    this.orchestrator = new SceneOrchestrator(
      { scene: this,gameService: this.gameService,eventBus: this.eventBus }    );
    this.setupSceneSpecificListeners();
    this.orchestrator.initialize();

    this.pitch.clearHighlights();
    this.pitch.clearHover();
    this.pitch.clearPath();

    this.rebuildDugouts();

    this.reconcileBoard();
  }

  createBombSprite(x: number, y: number): BombSprite {
    return new BombSprite(this, x, y);
  }

  constructor(key = "GameScene") {
    super({ key });
  }

  init(data: GameSceneData): void {
    const start = resolveMatchStart(data, this.sys.settings.key);
    this.team1 = start.team1;
    this.team2 = start.team2;
    this.competitionContext = start.competitionContext;
    this.resumedMatch = start.resumed;
    this.autosaveEnabled = start.autosaveEnabled;
    this.kickingTeam = start.kickingTeam;
    this.receivingTeam = start.receivingTeam;

    ensureMatchServices(start, data.progressionEnabled);
    this.diceLog?.dispose();
    this.diceLog = startDiceLog(start, this.sys.settings.key);

    const container = ServiceContainer.getInstance();
    this.gameService = container.gameService;
    this.eventBus = container.eventBus;
  }

  preload(): void {
    preloadVenue(this);
    preloadSidelineArt(this);
    this.queueTeamArt();
    this.load.on(Phaser.Loader.Events.PROGRESS, (progress: number) => {
      this.eventBus?.emit(GameEventNames.UI_LoadProgress, { progress });
    });
  }

  protected queueTeamArt(): ReadonlySet<string> {
    const players = [this.team1, this.team2].flatMap((team) =>
      team.players.map((player) => ({
        rosterName: team.rosterName,
        positionName: player.positionName,
        player,
        colors: this.kitOf(team.id),
      }))
    );
    preloadPlayerArt(this, players);
    return preloadLooks(
      this,
      players.map(({ rosterName, positionName, player, colors }) => ({
        model: modelFor(rosterName, positionName),
        appearance: appearanceOf(player, rosterName),
        colors,
      }))
    );
  }

  create(): void {
    this.venue = createVenueBackdrop(this, {
      home: this.kitOf(this.team1.id).primary,
      away: this.kitOf(this.team2.id).primary,
    });
    wirePointerInput(this);

    const origin = this.venue.origin;
    this.pitch = new Pitch(this, origin.x, origin.y);

    this.createDugouts();

    this.movementValidator = new MovementValidator();

    this.gameplayController = new GameplayInteractionController(
      { scene: this,gameService: this.gameService,eventBus: this.eventBus,pitch: this.pitch,movementValidator: this.movementValidator }    );

    this.initializeControllers();

    const panels = watchHudPanels(() => {
      this.cameraController.refreshFraming();
    });
    this.busSubscriptions.push(() => {
      panels.stop();
    });
    this.cameraController = new CameraController(
      {
        scene: this,pitch: this.pitch,world: { width: this.venue.width,height: this.venue.height },dugoutPoints: [
          ...Array.from(this.dugouts.values()).flatMap((d) => d.getBounds()),
          ...this.staffTerraces.flatMap((terrace) => terrace.bounds),
        ],eventBus: this.eventBus,hudRects: () => {
          panels.watch();
          return measureHudRects(
            this.game.canvas,
            { width: this.scale.width, height: this.scale.height },
            this.gameService.getKickoffEventStep() !== null
          );
        }
      }    );

    this.touchController = wireTouchInput(this);

    this.orchestrator = new SceneOrchestrator(
      { scene: this,gameService: this.gameService,eventBus: this.eventBus }    );
    this.setupSceneSpecificListeners();
    this.orchestrator.initialize();

    if (this.resumedMatch) {
      this.reconcileBoard();
      this.eventBus.emit(
        GameEventNames.GameStateRestored,
        this.gameService.getState()
      );
      void this.gameService.resumeKick();
    }

    if (this.autosaveEnabled) this.autosave = startAutosave(this);

    subscribeTurnMarkers(this);
    subscribeWallHits(this);
    followMatchWithCamera(this);
    this.busSubscriptions.push(locateActionOnScreen(this));

    this.eventBus.emit(GameEventNames.UI_LoadProgress, { progress: 1 });
    if (!this.resumedMatch) this.cameraController.intro();

    this.busSubscriptions.push(
      drawsFor(this.eventBus, () =>
        Promise.all([
          ...[...this.playerSprites.values()].map((sprite) => sprite.motion),
          this.ballSprite?.arrived(),
        ])
      )
    );

    this.events.on(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);
    this.events.on(Phaser.Scenes.Events.DESTROY, this.shutdown, this);
  }

  private shutdown(): void {
    this.venue?.destroy();
    this.autosave?.dispose();
    this.autosave = null;
    this.diceLog?.dispose();
    this.diceLog = null;

    for (const unsubscribe of this.busSubscriptions) {
      unsubscribe();
    }
    this.busSubscriptions = [];

    if (this.gameplayController) {
      this.gameplayController.destroy();
    }

    if (this.orchestrator) {
      this.orchestrator.destroy();
    }

    this.touchController?.destroy();
    this.touchController = null;

    if (this.cameraController) {
      this.cameraController.destroy();
    }

    this.playerSprites.forEach((sprite) => {
      sprite.destroy();
    });
    this.playerSprites.clear();

    if (this.ballSprite) {
      this.ballSprite.destroy();
      this.ballSprite = null;
    }

    if (this.dugouts) {
      this.dugouts.forEach((dugout) => {
        if (dugout && typeof dugout.destroy === "function") {
          dugout.destroy();
        }
      });
      this.dugouts.clear();
    }
    for (const terrace of this.staffTerraces) {
      terrace.destroy();
    }
    this.staffTerraces = [];

    this.pitch?.destroy();
  }

  public raisePlayerAt(worldX: number, worldY: number): void {
    const square = this.pitch.worldToGrid(worldX, worldY);
    let hovered: PlayerSprite | null = null;
    for (const sprite of this.playerSprites.values()) {
      const at = sprite.getPlayer().gridPosition;
      if (sprite.visible && at?.x === square.x && at.y === square.y) {
        hovered = sprite;
        break;
      }
    }
    if (hovered === this.raisedSprite) return;
    if (this.raisedSprite?.active) this.raisedSprite.setRaised(false);
    hovered?.setRaised(true);
    this.raisedSprite = hovered;
  }

  private createDugouts(): void {
    if (!this.isSceneLive("createDugouts")) return;
    const toWorld = (gx: number, gy: number) =>
      this.pitch.getPointPosition(gx, gy);
    const { dugouts, gates } = this.venue;
    const benches = [
      [this.team1, dugouts.home, "s", gates.home],
      [this.team2, dugouts.away, "n", gates.away],
    ] as const;
    for (const [team, squares, facing, gateX] of benches) {
      const dugout = new Dugout({ scene: this, team: team, kit: this.kitOf(team.id), squares: squares, toWorld: toWorld, facing: facing, exit: { rows: GameConfig.PITCH_HEIGHT, ...(gateX === undefined ? {} : { gateX }) } }
      );
      dugout.setDragCallbacks(
        (id) => {
          this.onDugoutDragStart(id);
        },
        (id, x, y) => {
          this.onDugoutDragEnd(id, x, y);
        }
      );
      this.dugouts.set(team.id, dugout);
      this.staffTerraces.push(
        new SidelineTerrace({ scene: this, team: team, kit: this.kitOf(team.id), squares: squares, project: toWorld, facing: facing, bus: this.eventBus }
        )
      );
    }
  }

  private rebuildDugouts(): void {
    this.dugouts.forEach((d) => {
      d.destroy();
    });
    this.dugouts.clear();
    for (const terrace of this.staffTerraces) {
      terrace.destroy();
    }
    this.staffTerraces = [];
    this.createDugouts();
  }

  private initializeControllers(): void {
    this.validator = new SetupValidator();
    this.formationManager = new FormationManager();
    this.placementController = new PlayerPlacementController(
      {
        _scene: this,pitch: this.pitch,validator: this.validator,isAvailable: (playerId) => this.gameService.isSetupEligible(playerId),getPlayerLimits: (teamId) => {
          const status=this.gameService.getSetupStatus(teamId);
          return status?.swarming
            ? {
              minimum: status.requiredPlayerCount,
              maximum: status.requiredPlayerCount+
                status.swarming.maximumAdditionalPlayers,
            }
            :undefined;
        }
      }    );

    subscribeBoardEvents(this);
  }

  public startSetupPhase(): void {
    this.isSetupActive = true;
  }

  public celebrateDugout(teamId: string): Promise<void> {
    return this.dugouts.get(teamId)?.animateCelebration() ?? Promise.resolve();
  }

  public startPlacement(subPhase: SubPhase): void {
    this.orchestrator.startPlacement(subPhase);
  }

  public highlightSetupZone(isTeam1: boolean): void {
    this.pitch.highlightSetupZone(isTeam1);
  }

  public enablePlacement(activeTeam: Team, isTeam1: boolean): void {
    this.isSetupActive = true;

    const dugout = this.dugouts.get(activeTeam.id);
    const sprites = dugout ? dugout.getSprites() : new Map();
    this.placementController.enablePlacement(activeTeam, isTeam1, sprites);

    this.repositionTeam = activeTeam;
    applyPitchRepositioning(this);
  }

  public syncPlayerStatuses(): void {
    this.playerSprites.forEach((sprite) => {
      const player = sprite.getPlayer();
      if (player.gridPosition) {
        sprite.updateStatus();
      } else {
        sprite.setVisible(false);
      }
    });
  }

  public disableSetupInteraction(): void {
    this.isSetupActive = false;
    this.repositionTeam = null;

    if (this.placementController) this.placementController.disablePlacement();
    applyPitchRepositioning(this);
    if (this.pitch) this.pitch.clearHighlights();
  }

  public repositionTeam: Team | null = null;

  public setKickoffSolidDefenceDragPlayers(playerIds: string[]): void {
    dragSolidDefencePlayers(this, playerIds);
  }

  public awaitsEngine(accepted: boolean): boolean {
    return accepted && this.gameService.runsCommandsLater === true;
  }

  private setupSceneSpecificListeners(): void {
    listenToPlacement(this);
  }

  public refreshDugouts(): void {
    if (!this.isSceneLive("refreshDugouts")) return;
    this.dugouts.forEach((d) => {
      d.refresh();
    });
    if (this.isSetupActive) {
      this.placementController?.syncFromTeam();

      this.placementController?.applySetupHitAreas();
    }
    this.placePlayersOnPitch();
  }

  public startPlayPhase(): void {
    this.isSetupActive = false;
    this.repositionTeam = null;
    applyPitchRepositioning(this);
    this.placementController?.restoreFigureHitAreas();
    this.pitch.clearHighlights();
    this.eventBus.emit(GameEventNames.UI_HideSetupControls, undefined);

    this.placePlayersOnPitch();
  }

  public startKickoffPhase(subPhase?: SubPhase): void {
    this.startPlayPhase();

    if (subPhase === SubPhase.ROLL_KICKOFF) {
      this.eventBus.emit(
        GameEventNames.UI_Notification,
        "Select Kicker & Target"
      );
    }
  }

  public placePlayersOnPitch(): void {
    board.placePlayersOnPitch(this);
  }

  public checkSetupCompleteness(): void {
    this.orchestrator.checkSetupCompleteness();
  }

  public onBackgroundClick(): void {
    if (this.isSetupActive) {
      this.placementController?.deselectPlayer();
      this.pitch.clearHighlights();
    } else {
      this.gameplayController?.deselectPlayer();
    }
  }

  public clearAllHighlights(): void {
    if (this.gameplayController) {
      this.gameplayController.clearAllInteractionHighlights();
    } else {
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
    if (!this.isSetupActive) {
      return;
    }

    const gridPos = this.pitch.worldToGrid(x, y);
    this.placementController.placePlayer(playerId, gridPos.x, gridPos.y);
  }

  public kitOf(teamId: string): TeamColors {
    return kitOf([this.team1, this.team2], teamId);
  }

  public playerSettled(playerId: string): Promise<void> {
    return this.playerSprites.get(playerId)?.motion ?? Promise.resolve();
  }

  public animateBallAlong(
    from: { x: number; y: number },
    path: { x: number; y: number }[],
    delayMs = 0
  ): void {
    board.animateBallAlong(this, from, path, delayMs);
  }

  public placeBallVisual(x: number, y: number, height = 0): void {
    board.placeBallVisual(this, x, y, height);
  }

  public reconcileBallVisual(): void {
    board.reconcileBallVisual(this);
  }

  public reconcilePlayerLocation(playerId: string, reposition = false): void {
    board.reconcilePlayerLocation(this, playerId, reposition);
  }

  public reconcileBoard(): void {
    board.reconcileBoard(this);
  }

  public highlightPlayer(playerId: string, color = 0xffff00): void {
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
