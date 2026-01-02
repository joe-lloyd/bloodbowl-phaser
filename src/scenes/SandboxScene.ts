import { GameScene } from "./GameScene";
import { GamePhase } from "../types/GameState";
import { TestTeamFactory } from "../game/controllers/TestTeamFactory";
import { RosterName } from "../types/Team";
import { Team } from "../types/Team";

import { ServiceContainer } from "../services/ServiceContainer";
import { GameService } from "../services/GameService";
import { ScenarioLoader } from "../services/ScenarioLoader";
import { SCENARIOS } from "../data/scenarios";
import { GameEventNames } from "@/types/events";

export class SandboxScene extends GameScene {
  constructor() {
    super("SandboxScene");
  }

  init(data: { team1?: Team; team2?: Team }): void {
    // If teams are passed, use them. Otherwise generate Mock Teams.
    if (data && data.team1 && data.team2) {
      // Need to initialize ServiceContainer before GameScene uses it
      const initialState = GameService.createInitialState(
        data.team1,
        data.team2,
        GamePhase.SANDBOX_IDLE
      );
      ServiceContainer.initialize(
        (window as any).eventBus,
        data.team1,
        data.team2,
        initialState
      );
      super.init(data as { team1: Team; team2: Team });
    } else {
      const team1 = TestTeamFactory.createTestTeam(
        RosterName.AMAZON,
        "Test Amazon",
        0x4169e1
      );
      const team2 = TestTeamFactory.createTestTeam(
        RosterName.BLACK_ORC,
        "Test Black Orcs",
        0xdc143c
      );

      // Initialize ServiceContainer MANUALLY since we skipped TeamSelectScene
      const initialState = GameService.createInitialState(
        team1,
        team2,
        GamePhase.SANDBOX_IDLE
      );
      ServiceContainer.initialize(
        (window as any).eventBus,
        team1,
        team2,
        initialState
      );

      super.init({ team1, team2 });
    }

    // Listen for shutdown to clean up custom listeners
    this.events.on(Phaser.Scenes.Events.SHUTDOWN, this.cleanupSandbox, this);
    this.events.on(Phaser.Scenes.Events.DESTROY, this.cleanupSandbox, this);
  }

  private loadScenarioHandler: ((data: { scenarioId: string }) => void) | null =
    null;
  private refreshBoardHandler: (() => void) | null = null;
  private playerMovedHandler: (() => void) | null = null;

  create(): void {
    super.create();

    // Add sandbox specific listeners
    this.loadScenarioHandler = (data: { scenarioId: string }) => {
      this.loadScenario(data.scenarioId);
    };

    this.eventBus.on(GameEventNames.UI_LoadScenario, this.loadScenarioHandler);

    this.refreshBoardHandler = () => {
      this.refreshDugouts();
    };
    this.eventBus.on(GameEventNames.RefreshBoard, this.refreshBoardHandler);

    // Sandbox-specific: Allow unlimited player movement for testing
    // Clear activation status after each move so players can be moved multiple times
    this.playerMovedHandler = () => {
      const state = this.gameService.getState();
      state.turn.activatedPlayerIds.clear();
    };
    this.eventBus.on(GameEventNames.PlayerMoved, this.playerMovedHandler);

    // Check for scenario query param
    const urlParams = new URLSearchParams(window.location.search);
    const scenarioId = urlParams.get("scenario");
    if (scenarioId) {
      // Delay slightly to ensure everything is ready
      this.time.delayedCall(100, () => {
        this.loadScenario(scenarioId);
      });
    }
  }

  private loadScenario(scenarioId: string): void {
    const scenario = SCENARIOS.find((s) => s.id === scenarioId);
    if (scenario) {
      // CRITICAL: Destroy old ball sprite BEFORE loading new scenario
      // This prevents duplicate balls when loading multiple scenarios
      if (this.ballSprite) {
        this.ballSprite.destroy();
        this.ballSprite = null;
      }

      const loader = new ScenarioLoader(this.eventBus, this.team1, this.team2);

      loader.load(scenario);
      this.reloadState(false);
      this.placePlayersOnPitch();

      this.eventBus.emit(
        GameEventNames.UI_Notification,
        `Loaded Scenario: ${scenario.name}`
      );

      // Update URL with scenario ID
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.set("scenario", scenarioId);
      window.history.pushState({ path: newUrl.href }, "", newUrl.href);
    } else {
      console.warn(`Scenario not found: ${scenarioId}`);
      this.eventBus.emit(
        GameEventNames.UI_Notification,
        `Scenario not found: ${scenarioId}`
      );
    }
  }

  private cleanupSandbox(): void {
    if (this.loadScenarioHandler) {
      this.eventBus.off(
        GameEventNames.UI_LoadScenario,
        this.loadScenarioHandler
      );
      this.loadScenarioHandler = null;
    }
    if (this.refreshBoardHandler) {
      this.eventBus.off(GameEventNames.RefreshBoard, this.refreshBoardHandler);
      this.refreshBoardHandler = null;
    }
    if (this.playerMovedHandler) {
      this.eventBus.off(GameEventNames.PlayerMoved, this.playerMovedHandler);
      this.playerMovedHandler = null;
    }
    // ballPlacedHandler removed - no longer needed
  }

  // Override standard setup to skip coin flip in sandbox mode
  public startSetupPhase(): void {
    // In sandbox mode, skip the coin flip and just wait for user to load a scenario
    // Don't auto-load any scenario - let user choose via UI
    this.isSetupActive = false; // Don't show setup controls
    this.eventBus.emit(
      GameEventNames.UI_Notification,
      "Sandbox Mode - Load a scenario to begin"
    );
  }
}
