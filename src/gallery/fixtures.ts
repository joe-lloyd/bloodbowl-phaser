import { EventBus } from "../services/EventBus";
import { ServiceContainer } from "../services/ServiceContainer";
import { GameService } from "../services/GameService";
import { TeamFactory } from "../game/TeamFactory";
import { applyScenario } from "../game/applyScenario";
import { SCENARIOS } from "../data/scenarios";
import { RosterName, type Team } from "../types/Team";
import { GamePhase } from "../types/GameState";
import { type Player } from "../types/Player";

export interface FixtureOptions {
  scenario?: string;
  team1Name?: string;
  team2Name?: string;
  team1Color?: number;
  team2Color?: number;
  team1Roster?: RosterName;
  team2Roster?: RosterName;
  phase?: GamePhase;
  progression?: boolean;
}

export interface MatchFixture {
  bus: EventBus;
  services: ServiceContainer;
  team1: Team;
  team2: Team;

  player: (team: 1 | 2, index: number) => Player;
}

export function setupMatch(options: FixtureOptions = {}): MatchFixture {
  const scenario = options.scenario
    ? SCENARIOS.find((s) => s.id === options.scenario)
    : undefined;
  const team1 = TeamFactory.createTestTeam(
    options.team1Roster ?? scenario?.setup.team1Roster ?? RosterName.HUMAN,
    options.team1Name ?? "Reikland Reavers",
    options.team1Color ?? 0x3d6fe0
  );
  const team2 = TeamFactory.createTestTeam(
    options.team2Roster ?? scenario?.setup.team2Roster ?? RosterName.ORC,
    options.team2Name ?? "Gouged Eye",
    options.team2Color ?? 0xd0283a
  );
  team1.apothecary = true;
  team1.coaches = 2;

  const bus = new EventBus();
  const state = scenario
    ? applyScenario(scenario, team1, team2)
    : GameService.createInitialState({ team1: team1, team2: team2, startingPhase: options.phase ?? GamePhase.PLAY }
      );
  if (options.phase) state.phase = options.phase;

  ServiceContainer.reset();
  const services = ServiceContainer.initialize({ eventBus: bus, team1: team1, team2: team2, initialState: state, seed: 7, progressionEnabled: options.progression ?? false });
  services.gameService.seedTurnCounts(state.turn.turnNumber || 1);

  const player = (team: 1 | 2, index: number) => {
    const roster = (team === 1 ? team1 : team2).players;
    const picked = roster[Math.min(index, roster.length - 1)];
    if (!picked) throw new Error(`team ${String(team)} has no players`);
    return picked;
  };
  return { bus, services, team1, team2, player };
}
