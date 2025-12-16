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
     * Handle phase transitions
     */
    private handlePhaseChange(phase: GamePhase, subPhase?: SubPhase): void {
        if (phase === GamePhase.SETUP) {
            if (subPhase === SubPhase.SETUP_KICKING) {
                this.scene['startPlacement'](SubPhase.SETUP_KICKING);
            } else if (subPhase === SubPhase.SETUP_RECEIVING) {
                this.scene['startPlacement'](SubPhase.SETUP_RECEIVING);
            } else if (subPhase === SubPhase.COIN_FLIP) {
                this.scene['isSetupActive'] = true;
                this.eventBus.emit("ui:startCoinFlip", {
                    team1: this.scene.team1,
                    team2: this.scene.team2
                });
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
            this.scene['startSetupPhase']();
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
