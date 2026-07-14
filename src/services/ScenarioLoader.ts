import { ServiceContainer } from "./ServiceContainer";
import { IEventBus } from "./EventBus";
import { GameEventNames } from "../types/events";
import { Scenario } from "@/types/Scenario";
import { Team } from "@/types/Team";
import { applyScenario } from "../game/applyScenario";

export class ScenarioLoader {
  constructor(
    private eventBus: IEventBus,
    private team1: Team,
    private team2: Team
  ) {}

  /**
   * Load a scenario by resetting the game service and initializing with new state
   */
  public load(scenario: Scenario): void {
    const initialState = applyScenario(scenario, this.team1, this.team2);

    // Re-Mount ServiceContainer with optional scenario seed
    ServiceContainer.reset();

    // If scenario has a seed, use it for deterministic outcomes
    const seed = scenario.seed;
    if (seed !== undefined) {
      console.log(
        `[ScenarioLoader] Loading scenario with deterministic seed: ${seed}`
      );
      if (scenario.expectedOutcome) {
        console.log(
          `[ScenarioLoader] Expected outcome: ${scenario.expectedOutcome}`
        );
      }
    }

    ServiceContainer.initialize(
      this.eventBus,
      this.team1,
      this.team2,
      initialState,
      seed
    );

    // 4. Trigger UI Refresh and Turn Start
    this.eventBus.emit(GameEventNames.GameStateRestored, initialState);

    // Emit phase change to update UI
    this.eventBus.emit(GameEventNames.PhaseChanged, {
      phase: initialState.phase,
      subPhase: initialState.subPhase,
      activeTeamId: initialState.activeTeamId ?? undefined,
    });

    // Emit turn started to initialize turn state in UI
    // This is CRITICAL for allowing the active team to take actions
    this.eventBus.emit(GameEventNames.TurnStarted, {
      teamId: initialState.turn.teamId,
      turnNumber: initialState.turn.turnNumber,
      isHalf2: initialState.turn.isHalf2,
    });

    // Emit turn data to update action availability
    this.eventBus.emit(GameEventNames.TurnDataUpdated, {
      hasBlitzed: initialState.turn.hasBlitzed,
      hasPassed: initialState.turn.hasPassed,
      hasHandedOff: initialState.turn.hasHandedOff,
      hasFouled: initialState.turn.hasFouled,
    });

    this.eventBus.emit(GameEventNames.RefreshBoard);

    // Emit placements for UI
    this.emitPlacements(this.team1);
    this.emitPlacements(this.team2);

    if (initialState.ballPosition) {
      this.eventBus.emit(GameEventNames.BallPlaced, initialState.ballPosition);
    }
  }

  private emitPlacements(team: Team): void {
    team.players.forEach((p) => {
      if (p.gridPosition) {
        this.eventBus.emit(GameEventNames.PlayerPlaced, {
          playerId: p.id,
          x: p.gridPosition.x,
          y: p.gridPosition.y,
        });
      }
    });
  }
}
