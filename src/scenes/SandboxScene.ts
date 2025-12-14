import { GameScene } from "./GameScene";
import { SCENARIOS } from "../data/scenarios";
import { TestTeamFactory } from "../game/setup/TestTeamFactory";
import { RosterName } from "../types/Team";
import { Team } from "../types/Team";
import { ServiceContainer } from "../services/ServiceContainer";



export class SandboxScene extends GameScene {
    constructor() {
        super('SandboxScene');
    }

    init(data: { team1?: Team; team2?: Team }): void {
        // If teams are passed, use them. Otherwise generate Mock Teams.
        if (data && data.team1 && data.team2) {
            // Need to initialize ServiceContainer before GameScene uses it
            ServiceContainer.initialize((window as any).eventBus, data.team1, data.team2);
            super.init(data as { team1: Team; team2: Team });
        } else {
            console.log("Sandbox: No teams provided. Generating Default Test Teams.");
            const team1 = TestTeamFactory.createTestTeam(RosterName.AMAZON, "Test Amazon", 0x4169E1);
            const team2 = TestTeamFactory.createTestTeam(RosterName.BLACK_ORC, "Test Black Orcs", 0xDC143C);

            // Initialize ServiceContainer MANUALLY since we skipped TeamSelectScene
            ServiceContainer.initialize((window as any).eventBus, team1, team2);

            super.init({ team1, team2 });
        }

        // Listen for shutdown to clean up custom listeners
        this.events.on(Phaser.Scenes.Events.SHUTDOWN, this.cleanupSandbox, this);
        this.events.on(Phaser.Scenes.Events.DESTROY, this.cleanupSandbox, this);
    }

    private loadScenarioHandler: Function | null = null;
    private refreshBoardHandler: Function | null = null;
    private ballPlacedHandler: Function | null = null;


    create(): void {

        super.create();

        // Add sandbox specific listeners
        this.loadScenarioHandler = (data: { scenarioId: string }) => {
            const scenario = SCENARIOS.find(s => s.id === data.scenarioId);
            if (scenario) {
                this.gameService.loadScenario(scenario);
                this.eventBus.emit('ui:notification', `Loaded Scenario: ${scenario.name}`);
            }
        };

        this.eventBus.on('ui:loadScenario', this.loadScenarioHandler as any);

        this.refreshBoardHandler = () => {
            this.refreshDugouts();
        };
        this.eventBus.on('refreshBoard', this.refreshBoardHandler as any);

        this.ballPlacedHandler = (pos: { x: number, y: number }) => {
            this.placeBallVisual(pos.x, pos.y);
        };
        this.eventBus.on('ballPlaced', this.ballPlacedHandler as any);
    }

    private cleanupSandbox(): void {
        if (this.loadScenarioHandler) {
            this.eventBus.off('ui:loadScenario', this.loadScenarioHandler as any);
            this.loadScenarioHandler = null;
        }
        if (this.refreshBoardHandler) {
            this.eventBus.off('refreshBoard', this.refreshBoardHandler as any);
            this.refreshBoardHandler = null;
        }
        if (this.ballPlacedHandler) {
            this.eventBus.off('ballPlaced', this.ballPlacedHandler as any);
            this.ballPlacedHandler = null;
        }
    }

    // Override standard setup to load the default scenario
    protected startSetupPhase(): void {
        console.log("Sandbox Mode: Skipping Setup, Loading Default Scenario...");
        const defaultScenario = SCENARIOS.find(s => s.id === 'basic-scrimmage');
        if (defaultScenario) {
            // Add small delay to ensure everything is ready
            this.time.delayedCall(100, () => {
                this.gameService.loadScenario(defaultScenario);
                this.eventBus.emit('ui:notification', "Sandbox Mode Started");
            });
        }
    }
}
