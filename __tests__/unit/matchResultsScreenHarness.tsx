/**
 * Shared setup for the MatchResultsScreen tests: a fresh React root per
 * test, a two-team match at full time, and a league to record it in.
 */
import { act } from "react";
import { createRoot, Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, vi } from "vitest";
import { ServiceContainer } from "../../src/services/ServiceContainer";
import { EventBus } from "../../src/services/EventBus";
import { GamePhase } from "../../src/types/GameState";
import { MatchResultsScreen } from "../../src/ui/components/hud/MatchResultsScreen";
import { TeamBuilder } from "../utils/test-builders";
import {
  computeStandings,
  generateRoundRobin,
} from "../../src/competition/logic";
import { saveCompetition } from "../../src/competition/repository";
import { CompetitionEntrant, LeagueDoc } from "../../src/competition/types";
import {
  saveTeams,
  setTeamRepository,
} from "../../src/game/managers/TeamManager";
import { Team } from "../../src/types/Team";

/**
 * Mounts a root in a fresh container before each test, and unmounts it and
 * resets the game after. A test may replace `root` to mount the screen anew.
 */
export function resultsHarness() {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    setTeamRepository(null);
    await act(async () => root.unmount());
    container.remove();
    ServiceContainer.reset();
  });

  return {
    get container() {
      return container;
    },
    get root() {
      return root;
    },
    set root(next: Root) {
      root = next;
    },
    async render() {
      await act(async () => {
        root.render(
          <MemoryRouter>
            <MatchResultsScreen visible={true} />
          </MemoryRouter>
        );
      });
    },
  };
}

export function setup(progressionEnabled: boolean) {
  const team1 = new TeamBuilder()
    .withId("team-1")
    .withName("Reikland Reavers")
    .withPlayers(2)
    .build();
  const team2 = new TeamBuilder()
    .withId("team-2")
    .withName("Bad Badgers")
    .withPlayers(2)
    .build();
  [...team1.players, ...team2.players].forEach((p) => {
    p.playerName = `Player ${p.number}`;
  });
  const eventBus = new EventBus();
  const services = ServiceContainer.initialize(
    eventBus,
    team1,
    team2,
    undefined,
    undefined,
    undefined,
    progressionEnabled
  );
  const state = services.gameService.getState();
  state.phase = GamePhase.GAME_OVER;
  return { services, state, team1, team2 };
}

/** A league of the two teams, stored with them, as the coach left it at kick-off. */
export async function leagueOf(teams: Team[]): Promise<LeagueDoc> {
  const entrants: CompetitionEntrant[] = teams.map((team, index) => ({
    id: `local:${team.id}`,
    teamId: team.id,
    ownerUid: null,
    name: team.name,
    rosterName: team.rosterName,
    seed: index + 1,
  }));
  const fixtures = generateRoundRobin(entrants);
  const league: LeagueDoc = {
    id: "season-1",
    type: "league",
    name: "Season 1",
    organizerUid: null,
    participantUids: [],
    status: "active",
    entrants,
    fixtures,
    standings: computeStandings(entrants, fixtures),
    points: { win: 3, draw: 1, loss: 0 },
    createdAt: 1,
    updatedAt: 1,
  };
  await saveCompetition(league);
  teams.forEach((team) => (team.activeCompetitionId = league.id));
  saveTeams(teams.map((team) => structuredClone(team)));
  return league;
}
