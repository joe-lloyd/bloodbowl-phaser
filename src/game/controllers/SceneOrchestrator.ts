import { GameScene } from '../../scenes/GameScene';
import { IGameService } from '../../services/interfaces/IGameService';
import { IEventBus } from '../../services/EventBus';
import { GamePhase, SubPhase } from '../../types/GameState';

/**
 * SceneOrchestrator - Manages game flow and phase transitions
 * 
 * Extracted from GameScene to separate view logic from game flow logic.
 * Handles event coordination, phase transitions, and delegates to appropriate controllers.
 */

interface SceneOrchestratorConfig {
    skipCoinFlip?: boolean;      // For scenarios that start mid-game
    startingPhase?: GamePhase;   // Override starting phase
    startingSubPhase?: SubPhase; // Override starting subphase
}

export class SceneOrchestrator {
    private scene: GameScene;
    private gameService: IGameService;
    private eventBus: IEventBus;
    private config: SceneOrchestratorConfig;

    private eventHandlers: Map<string, Function> = new Map();

    constructor(
        scene: GameScene,
        gameService: IGameService,
        eventBus: IEventBus,
        config: SceneOrchestratorConfig = {}
    ) {
        this.scene = scene;
        this.gameService = gameService;
        this.eventBus = eventBus;
        this.config = config;
    }

    /**
     * Setup all event listeners for game flow
     */
    public setupEventListeners(): void {
        // Coin flip handling
        const onCoinFlipComplete = (data: { kickingTeam: any, receivingTeam: any }) => {
            this.scene.kickingTeam = data.kickingTeam;
            this.scene.receivingTeam = data.receivingTeam;
            this.gameService.startSetup(data.kickingTeam.id);
        };
        this.eventHandlers.set('ui:coinFlipComplete', onCoinFlipComplete);
        this.eventBus.on('ui:coinFlipComplete', onCoinFlipComplete);

        // Setup actions (confirm, randomize, clear, save, load)
        const onSetupAction = (data: { action: string }) => {
            const state = this.gameService.getState();
            const activeTeamId = state.activeTeamId || this.scene.team1.id;
            const activeTeam = activeTeamId === this.scene.team1.id ? this.scene.team1 : this.scene.team2;
            const isTeam1 = activeTeam.id === this.scene.team1.id;

            switch (data.action) {
                case 'confirm':
                    this.gameService.confirmSetup(activeTeam.id);
                    break;
                case 'default':
                    const defFormation = this.scene['formationManager'].getDefaultFormation(isTeam1);
                    this.scene['placementController'].loadFormation(defFormation);
                    this.scene.refreshDugouts();
                    break;
                case 'clear':
                    this.scene['placementController'].clearPlacements();
                    this.scene.refreshDugouts();
                    break;
                case 'save':
                    const placements = this.scene['placementController'].getPlacements();
                    if (placements.length > 0) {
                        this.scene['formationManager'].saveFormation(activeTeam.id, placements, "Custom");
                        this.eventBus.emit('ui:notification', "Formation Saved!");
                    }
                    break;
                case 'load':
                    const savedFormation = this.scene['formationManager'].loadFormation(activeTeam.id, "Custom");
                    if (savedFormation) {
                        this.scene['placementController'].loadFormation(savedFormation);
                        this.scene.refreshDugouts();
                    } else {
                        this.eventBus.emit('ui:notification', "No Saved Formation");
                    }
                    break;
            }
        };
        this.eventHandlers.set('ui:setupAction', onSetupAction);
        this.eventBus.on('ui:setupAction', onSetupAction);

        // Kickoff: Ball kicked animation
        const onBallKicked = (data: any) => {
            let startX = data.targetX;
            let startY = data.targetY;

            if (data.playerId && this.scene['playerSprites'].has(data.playerId)) {
                const kickerPlayer = this.gameService.getPlayerById(data.playerId);
                if (kickerPlayer && kickerPlayer.gridPosition) {
                    startX = kickerPlayer.gridPosition.x;
                    startY = kickerPlayer.gridPosition.y;
                }
            }

            this.scene['placeBallVisual'](startX, startY);
            const targetPos = this.scene['pitch'].getPixelPosition(data.targetX, data.targetY);

            this.scene.tweens.add({
                targets: this.scene['ballSprite'],
                x: targetPos.x,
                y: targetPos.y,
                duration: 800,
                ease: 'Quad.easeOut',
                onStart: () => {
                    this.scene['ballSprite']?.setScale(0.5);
                },
                yoyo: false,
            });

            this.scene.tweens.add({
                targets: this.scene['ballSprite'],
                scaleX: 1.5,
                scaleY: 1.5,
                duration: 400,
                yoyo: true,
                ease: 'Sine.easeOut'
            });

            this.scene['pendingKickoffData'] = data;
        };
        this.eventHandlers.set('ballKicked', onBallKicked);
        this.eventBus.on('ballKicked', onBallKicked);

        // Kickoff result notification
        const onKickoffResult = (data: { roll: number, event: string }) => {
            this.eventBus.emit('ui:notification', `${data.roll}: ${data.event}`);
            if (this.scene['pendingKickoffData']) {
                this.scene['animateBallScatter'](this.scene['pendingKickoffData']);
                this.scene['pendingKickoffData'] = null;
            }
        };
        this.eventHandlers.set('kickoffResult', onKickoffResult);
        this.eventBus.on('kickoffResult', onKickoffResult);

        // Ready to start (transition from kickoff to play)
        const onReadyToStart = () => {
            this.gameService.startGame(this.scene.kickingTeam.id);
        };
        this.eventHandlers.set('readyToStart', onReadyToStart);
        this.eventBus.on('readyToStart', onReadyToStart);

        // Phase change handling
        const onPhaseChanged = (data: { phase: GamePhase, subPhase?: SubPhase, activeTeamId?: string }) => {
            this.handlePhaseChange(data.phase, data.subPhase);
        };
        this.eventHandlers.set('phaseChanged', onPhaseChanged);
        this.eventBus.on('phaseChanged', onPhaseChanged);

        // Turn management
        const onTurnStarted = (turn: any) => {
            this.scene.refreshDugouts();
            this.eventBus.emit('ui:notification', `Turn ${turn.turnNumber}`);
        };
        this.eventHandlers.set('turnStarted', onTurnStarted);
        this.eventBus.on('turnStarted', onTurnStarted);

        // Player movement
        const onPlayerMoved = (data: { playerId: string, from: any, to: any, path?: any[] }) => {
            if (data.path && data.path.length > 0) {
                const sprite = this.scene['playerSprites'].get(data.playerId);
                if (sprite) {
                    const pixelPath = data.path.map((step: any) =>
                        this.scene['pitch'].getPixelPosition(step.x, step.y)
                    );
                    sprite.animateMovement(pixelPath).then(() => {
                        this.scene.refreshDugouts();
                        this.scene['checkSetupCompleteness']();
                    });
                } else {
                    this.scene.refreshDugouts();
                }
            } else {
                this.scene.refreshDugouts();
            }
            this.scene['pitch'].clearPath();
            this.scene['pitch'].clearHighlights();
        };
        this.eventHandlers.set('playerMoved', onPlayerMoved);
        this.eventBus.on('playerMoved', onPlayerMoved);

        // Kickoff events
        const onKickoffStarted = () => {
            this.eventBus.emit('ui:notification', "KICKOFF!");
        };
        this.eventHandlers.set('kickoffStarted', onKickoffStarted);
        this.eventBus.on('kickoffStarted', onKickoffStarted);
    }

    /**
     * Start the setup phase (coin flip)
     * Delegates to scene to allow overrides (e.g., SandboxScene skips coin flip)
     */
    public startSetupPhase(): void {
        // Call scene's startSetupPhase to allow overrides
        this.scene.startSetupPhase();
    }

    /**
     * Start placement for a specific team
     */
    public startPlacement(subPhase: SubPhase): void {
        const isKicking = subPhase === SubPhase.SETUP_KICKING;
        const activeTeam = isKicking ? this.scene.kickingTeam : this.scene.receivingTeam;
        const isTeam1 = activeTeam.id === this.scene.team1.id;

        this.eventBus.emit("ui:showSetupControls", { subPhase, activeTeam });

        // Tell scene to highlight setup zone (visual only)
        this.scene.highlightSetupZone(isTeam1);

        // Tell scene to enable placement (wiring controllers)
        this.scene.enablePlacement(activeTeam, isTeam1);
    }

    /**
     * Check if setup is complete and emit UI event
     */
    public checkSetupCompleteness(): void {
        if (!this.scene.isSetupActive) return;
        const state = this.gameService.getState();
        if (!state.activeTeamId) return;

        const isComplete = this.gameService.isSetupComplete(state.activeTeamId);
        this.eventBus.emit("ui:setupcomplete", isComplete);
    }

    /**
     * Handle phase transitions
     */
    private handlePhaseChange(phase: GamePhase, subPhase?: SubPhase): void {
        if (phase === GamePhase.SETUP) {
            if (subPhase === SubPhase.SETUP_KICKING) {
                this.startPlacement(SubPhase.SETUP_KICKING);
            } else if (subPhase === SubPhase.SETUP_RECEIVING) {
                this.startPlacement(SubPhase.SETUP_RECEIVING);
            } else if (subPhase === SubPhase.COIN_FLIP) {
                this.startSetupPhase();
            }
        } else if (phase === GamePhase.PLAY) {
            this.scene['startPlayPhase']();
        } else if (phase === GamePhase.KICKOFF) {
            this.scene['startKickoffPhase'](subPhase);
        }
    }

    /**
     * Initialize the game based on current state
     */
    public initialize(): void {
        const state = this.gameService.getState();

        if (this.config.startingPhase) {
            // Scenario mode - start at specific phase
            this.handlePhaseChange(this.config.startingPhase, this.config.startingSubPhase);
        } else if (state.phase === GamePhase.SETUP) {
            this.startSetupPhase();
        } else {
            this.scene['startPlayPhase']();
        }
    }

    /**
     * Cleanup event listeners
     */
    public destroy(): void {
        this.eventHandlers.forEach((handler, event) => {
            this.eventBus.off(event, handler as any);
        });
        this.eventHandlers.clear();
    }
}
