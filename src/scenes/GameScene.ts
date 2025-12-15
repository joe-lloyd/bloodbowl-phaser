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

  // Logic
  private movementValidator!: MovementValidator;
  private gameplayController!: GameplayInteractionController;

  // Services
  protected gameService!: IGameService;
  protected eventBus!: IEventBus;

  // State
  private playerSprites: Map<string, PlayerSprite> = new Map();
  private selectedPlayerId: string | null = null;
  private isSetupActive: boolean = false;
  private pendingKickoffData: any = null;
  private ballSprite: Phaser.GameObjects.Container | null = null;

  // Store handlers for cleanup
  private eventHandlers: Map<string, Function> = new Map();

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

    this.initializeControllers();
    this.movementValidator = new MovementValidator();

    // Gameplay Controller
    // Gameplay Controller
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

    // 6. Setup Event Listeners
    this.setupEventListeners();

    // 7. Start Logic based on Phase
    const state = this.gameService.getState();
    if (state.phase === GamePhase.SETUP) {
      this.startSetupPhase();
    } else {
      this.startPlayPhase();
    }

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

    // React UI handles CoinFlip, listen for result from EventBus
    this.eventBus.on("ui:coinFlipComplete", (data: { kickingTeam: Team, receivingTeam: Team }) => {
      this.kickingTeam = data.kickingTeam;
      this.receivingTeam = data.receivingTeam;

      this.gameService.startSetup(this.kickingTeam.id);
      this.startPlacement(SubPhase.SETUP_KICKING);
    });

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

  protected startSetupPhase(): void {
    this.isSetupActive = true;
    this.eventBus.emit("ui:startCoinFlip", { team1: this.team1, team2: this.team2 });
  }

  private startPlacement(subPhase: SubPhase): void {
    const isKicking = subPhase === SubPhase.SETUP_KICKING;
    const activeTeam = isKicking ? this.kickingTeam : this.receivingTeam;
    const isTeam1 = activeTeam.id === this.team1.id;

    this.eventBus.emit("ui:showSetupControls", { subPhase, activeTeam });

    // Pitch expects: highlightSetupZone(isLeft: boolean)
    this.pitch.highlightSetupZone(isTeam1);

    // Enable placement
    const dugout = this.dugouts.get(activeTeam.id);
    const sprites = dugout ? dugout.getSprites() : new Map();
    this.placementController.enablePlacement(activeTeam, isTeam1, sprites);
  }

  // Event Listeners
  private setupEventListeners(): void {
    const onPhaseChanged = (data: { phase: GamePhase, subPhase?: SubPhase, activeTeamId?: string }) => {
      const { phase, subPhase } = data;

      if (phase === GamePhase.SETUP) {
        if (subPhase === SubPhase.SETUP_KICKING) {
          this.startPlacement(SubPhase.SETUP_KICKING);
        } else if (subPhase === SubPhase.SETUP_RECEIVING) {
          this.startPlacement(SubPhase.SETUP_RECEIVING);
        } else if (subPhase === SubPhase.COIN_FLIP) {
          this.isSetupActive = true;
          this.eventBus.emit("ui:startCoinFlip", { team1: this.team1, team2: this.team2 });
        }
      } else if (phase === GamePhase.PLAY) {
        this.startPlayPhase();
      } else if (phase === GamePhase.KICKOFF) {
        this.startKickoffPhase(subPhase);
      }
    };
    this.eventBus.on("phaseChanged", onPhaseChanged);
    this.eventHandlers.set("phaseChanged", onPhaseChanged);

    const onTurnStarted = (turn: any) => {
      // React HUD handles UI update via this same event
      this.refreshDugouts();
      this.eventBus.emit('ui:notification', `Turn ${turn.turnNumber}`);
    };
    this.eventHandlers.set("turnStarted", onTurnStarted);
    this.eventBus.on("turnStarted", onTurnStarted);

    const onTurnEnded = () => {
      // React UI handles this
    };
    this.eventHandlers.set("turnEnded", onTurnEnded);
    this.eventBus.on("turnEnded", onTurnEnded);

    // Listen for UI Setup Actions
    const onSetupAction = (data: { action: string }) => {
      const state = this.gameService.getState();
      const activeTeamId = state.activeTeamId || this.team1.id;
      const activeTeam = activeTeamId === this.team1.id ? this.team1 : this.team2;
      const isTeam1 = activeTeam.id === this.team1.id;

      switch (data.action) {
        case 'confirm':
          this.gameService.confirmSetup(activeTeam.id);
          break;
        case 'default':
          const defFormation = this.formationManager.getDefaultFormation(isTeam1);
          this.placementController.loadFormation(defFormation);
          this.refreshDugouts();
          break;
        case 'clear':
          this.placementController.clearPlacements();
          this.refreshDugouts();
          break;
        case 'save':
          const placements = this.placementController.getPlacements();
          if (placements.length > 0) {
            this.formationManager.saveFormation(activeTeam.id, placements, "Custom");
            this.eventBus.emit('ui:notification', "Formation Saved!");
          }
          break;
        case 'load':
          const savedFormation = this.formationManager.loadFormation(activeTeam.id, "Custom");
          if (savedFormation) {
            this.placementController.loadFormation(savedFormation);
            this.refreshDugouts();
          } else {
            this.eventBus.emit('ui:notification', "No Saved Formation");
          }
          break;
      }
    };
    this.eventHandlers.set("ui:setupAction", onSetupAction);
    this.eventBus.on("ui:setupAction", onSetupAction);

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
    const onPlayerMoved = (data: { playerId: string, from: any, to: any, path?: any[] }) => {
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
    };
    this.eventHandlers.set("playerMoved", onPlayerMoved);
    this.eventBus.on("playerMoved", onPlayerMoved);

    const onKickoffStarted = () => {
      this.eventBus.emit('ui:notification', "KICKOFF!");
    };
    this.eventHandlers.set("kickoffStarted", onKickoffStarted);
    this.eventBus.on("kickoffStarted", onKickoffStarted);

    const onBallKicked = (data: any) => {
      console.log("ballKicked event received", data);

      // 1. Find Kicker Position (Start of Arc)
      let startX = data.targetX;
      let startY = data.targetY;

      // Try to find the kicker sprite
      if (data.playerId && this.playerSprites.has(data.playerId)) {
        // We have the sprite, but we need the GRID pos for placeBallVisual
        const kickerPlayer = this.gameService.getPlayerById(data.playerId);
        if (kickerPlayer && kickerPlayer.gridPosition) {
          startX = kickerPlayer.gridPosition.x;
          startY = kickerPlayer.gridPosition.y;
        }
      }

      // 2. Spawn Ball at Kicker
      this.placeBallVisual(startX, startY);

      // 3. Animate Kick (Kicker -> Target)
      const targetPos = this.pitch.getPixelPosition(data.targetX, data.targetY);

      this.tweens.add({
        targets: this.ballSprite,
        x: targetPos.x,
        y: targetPos.y,
        duration: 800,
        ease: 'Quad.easeOut',
        // Optional: Add scale effect for "height"
        onStart: () => {
          this.ballSprite?.setScale(0.5);
        },
        yoyo: false,

        // Using a second tween for scale arc (Up and Down)
        // Simple hack: Just move Z/Scale
      });

      // Simulate Arc Height
      this.tweens.add({
        targets: this.ballSprite,
        scaleX: 1.5,
        scaleY: 1.5,
        duration: 400,
        yoyo: true,
        ease: 'Sine.easeOut'
      });

      // Store scatter data for later animation (Phase 2)
      this.pendingKickoffData = data;
    };
    this.eventHandlers.set("ballKicked", onBallKicked);
    this.eventBus.on("ballKicked", onBallKicked);

    const onKickoffResult = (data: { roll: number, event: string }) => {
      // 2. Show Roll
      this.eventBus.emit('ui:notification', `${data.roll}: ${data.event}`);
      // this.diceLog.addLog(`Kickoff Table: ${data.roll} (${data.event})`);

      // 3. Animate Scatter (after delay or immediately)
      if (this.pendingKickoffData) {
        this.animateBallScatter(this.pendingKickoffData);
        this.pendingKickoffData = null;
      }
    };
    this.eventHandlers.set("kickoffResult", onKickoffResult);
    this.eventBus.on("kickoffResult", onKickoffResult);

    const onReadyToStart = () => {
      this.gameService.startGame(this.kickingTeam.id);
    };
    this.eventHandlers.set("readyToStart", onReadyToStart);
    this.eventBus.on("readyToStart", onReadyToStart);

    // DiceLog listener removed (Handled by React UI now)
    // this.eventBus.on("diceRoll", (data: { type: string, value: number, result: any }) => {
    //   this.diceLog.addLog(`${data.type}: ${data.result}`);
    // });

    // Sandbox / Scenario Events are now handled in SandboxScene
  }

  protected refreshDugouts(): void {
    this.dugouts.forEach(d => d.refresh());
    this.placePlayersOnPitch();
  }

  private startPlayPhase(): void {
    this.isSetupActive = false;
    this.pitch.clearHighlights(); // Clear setup zones
    this.eventBus.emit("ui:hideSetupControls");

    // Ensure all players are placed
    this.placePlayersOnPitch();
  }

  private startKickoffPhase(subPhase?: SubPhase): void {
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

  private checkSetupCompleteness(): void {
    if (!this.isSetupActive) return;

    const state = this.gameService.getState();
    if (!state.activeTeamId) return;

    const isComplete = this.gameService.isSetupComplete(state.activeTeamId);
    this.eventBus.emit("ui:setupcomplete", isComplete);
  }




  // Interactivity
  private onBackgroundClick(): void {
    if (this.isSetupActive) {
      this.placementController?.deselectPlayer();
    } else {
      // Delegate to controller to ensure state (waypoints, selection) is cleared
      this.gameplayController?.deselectPlayer();
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

  public handleKickoffInteraction(x: number, y: number, playerAtSquare: any): void {
    if (this.gameService.getPhase() !== GamePhase.KICKOFF) return;

    const subPhase = this.gameService.getSubPhase();

    if (subPhase === SubPhase.SETUP_KICKOFF) {
      // If clicking on a player
      if (playerAtSquare) {
        // If own player -> Select/Switch Kicker
        if (playerAtSquare.teamId === this.kickingTeam.id) {
          // Unhighlight previous if exists
          if (this.selectedPlayerId && this.selectedPlayerId !== playerAtSquare.id) {
            this.unhighlightPlayer(this.selectedPlayerId);
          }

          this.selectedPlayerId = playerAtSquare.id;
          this.highlightPlayer(playerAtSquare.id);
          this.gameService.selectKicker(playerAtSquare.id);
          this.eventBus.emit('ui:notification', "Kicker Selected! Now choose target.");
          return;
        }
      }

      // If clicking on a square (Target)
      // Validate Target (Must be opponent half?)
      // Blood Bowl rules: Kickoff target can be anywhere? 
      // Actually usually you kick to opponent. 
      // Let's assume standard opponent half check for now to guide user.
      const isTeam1Kicking = this.kickingTeam.id === this.team1.id;
      // Pitch width 20, minus the end zones its 18, this number is diveded by 3
      // so that means team one setup is 1-7, no mans land is 8-13, team two setup is 14-20
      const isOpponentHalf = isTeam1Kicking ? (x >= 7) : (x <= 13);

      if (!isOpponentHalf) {
        // If they clicked an empty square in their own half, maybe deselect?
        // Or just ignore/warn.
        if (this.selectedPlayerId) {
          this.eventBus.emit('ui:notification', "Kick to opponent's half!");
        }
        return;
      }

      // If we have a selected kicker and clicked opponent half -> KICK!
      if (this.selectedPlayerId) {
        this.gameService.kickBall(this.selectedPlayerId, x, y);
        this.selectedPlayerId = null; // Clear selection after kick
      } else {
        this.eventBus.emit('ui:notification', "Select a Kicker first!");
      }
    }
  }
}
