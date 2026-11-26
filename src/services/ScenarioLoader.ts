import { ServiceContainer } from "./ServiceContainer";
import { type IEventBus } from "./EventBus";
import { GameEventNames } from "../types/events";
import { type Scenario } from "@/types/Scenario";
import { type Team } from "@/types/Team";
import { applyScenario } from "../game/applyScenario";

export class ScenarioLoader {
  private eventBus: IEventBus;
  private team1: Team;
  private team2: Team;
  constructor(eventBus: IEventBus, team1: Team, team2: Team) {
    this.eventBus = eventBus;
    this.team1 = team1;
    this.team2 = team2;
  }

  public load(scenario: Scenario): void {
    const initialState = applyScenario(scenario, this.team1, this.team2);

    ServiceContainer.reset();

    const seed = scenario.seed;
    if (seed !== undefined) {
      console.log(
        `[ScenarioLoader] Loading scenario with deterministic seed: ${String(seed)}`
      );
      if (scenario.expectedOutcome) {
        console.log(
          `[ScenarioLoader] Expected outcome: ${scenario.expectedOutcome}`
        );
      }
    }

    ServiceContainer.initialize({
      eventBus: this.eventBus,
      team1: this.team1,
      team2: this.team2,
      initialState,
      ...(seed !== undefined && { seed }),
    });

    ServiceContainer.getInstance().gameService.seedTurnCounts(
      initialState.turn.turnNumber
    );

    this.eventBus.emit(GameEventNames.GameStateRestored, initialState);

    this.eventBus.emit(GameEventNames.PhaseChanged, {
      phase: initialState.phase,
      ...(initialState.subPhase !== undefined && { subPhase: initialState.subPhase }),
      ...(initialState.activeTeamId != null && { activeTeamId: initialState.activeTeamId }),
    });

    this.eventBus.emit(GameEventNames.TurnStarted, {
      teamId: initialState.turn.teamId,
      turnNumber: initialState.turn.turnNumber,
      isHalf2: initialState.turn.isHalf2,
    });

    this.eventBus.emit(GameEventNames.TurnDataUpdated, {
      hasBlitzed: initialState.turn.hasBlitzed,
      hasPassed: initialState.turn.hasPassed,
      hasHandedOff: initialState.turn.hasHandedOff,
      hasFouled: initialState.turn.hasFouled,
    });

    this.eventBus.emit(GameEventNames.RefreshBoard, undefined);

    this.emitPlacements(this.team1);
    this.emitPlacements(this.team2);

    if (initialState.ballPosition) {
      this.eventBus.emit(GameEventNames.BallPlaced, initialState.ballPosition);
    }
  }

  private emitPlacements(team: Team): void {
    for (const p of team.players) {
      if (p.gridPosition) {
        this.eventBus.emit(GameEventNames.PlayerPlaced, {
          playerId: p.id,
          x: p.gridPosition.x,
          y: p.gridPosition.y,
        });
      }
    }
  }
}
