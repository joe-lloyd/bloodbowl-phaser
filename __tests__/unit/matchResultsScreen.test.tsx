import { act } from "react";
import { createRoot, Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ServiceContainer } from "../../src/services/ServiceContainer";
import { EventBus } from "../../src/services/EventBus";
import { GameEventNames } from "../../src/types/events";
import { GamePhase } from "../../src/types/GameState";
import { MatchResultsScreen } from "../../src/ui/components/hud/MatchResultsScreen";
import { InjuryType, PlayerStatus } from "../../src/types/Player";
import { ArmourOperation } from "../../src/game/operations/ArmourOperation";
import { CrowdInjuryOperation } from "../../src/game/operations/CrowdInjuryOperation";
import { GameFlowManager, noDelay } from "../../src/game/core/GameFlowManager";
import { TeamBuilder } from "../utils/test-builders";
import {
  OnlineMatch,
  setActiveOnlineMatch,
} from "../../src/network/OnlineMatch";
import { setMatchSaveRepository } from "../../src/game/persistence/MatchSaveRepository";
import {
  computeStandings,
  generateRoundRobin,
} from "../../src/competition/logic";
import { saveCompetition } from "../../src/competition/repository";
import { recordCompetitionFixture } from "../../src/competition/resultRecording";
import { CompetitionEntrant, LeagueDoc } from "../../src/competition/types";
import { loadTeams, saveTeams } from "../../src/game/managers/TeamManager";
import { Team } from "../../src/types/Team";

vi.mock("../../src/firebase/config", () => ({
  isFirebaseConfigured: vi.fn(() => false),
  getDb: vi.fn(),
}));

describe("MatchResultsScreen", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    ServiceContainer.reset();
  });

  function setup(progressionEnabled: boolean) {
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

  async function render() {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <MatchResultsScreen visible={true} />
        </MemoryRouter>
      );
    });
  }

  it("shows the result and statistics for a progression-disabled match, with no SPP column and a free exit", async () => {
    const { state } = setup(false);
    state.score["team-1"] = 2;
    state.score["team-2"] = 1;

    await render();

    expect(container.textContent).toContain("Full Time");
    expect(container.textContent).toContain("Reikland Reavers");
    expect(container.textContent).toContain("Bad Badgers");
    expect(container.textContent).toContain("2 : 1");
    expect(container.textContent).toContain("Reikland Reavers win");
    const sppHeader = [...container.querySelectorAll("th")].find(
      (th) => th.textContent === "SPP"
    );
    expect(sppHeader).toBeUndefined();
    expect(
      [...container.querySelectorAll("th")].some(
        (th) => th.textContent === "MVP"
      )
    ).toBe(false);
    expect(container.textContent).toContain("This match does not award SPP");

    const exitButton = [...container.querySelectorAll("button")].find((b) =>
      b.textContent?.includes("Continue to Main Menu")
    )!;
    expect(exitButton.disabled).toBe(false);
  });

  it("clears the save when a match against the computer ends", async () => {
    setup(false);
    const clear = vi.fn();
    setMatchSaveRepository({
      read: () => null,
      write: () => {},
      clear,
      describe: () => null,
    });
    setActiveOnlineMatch({
      kind: "computer",
      myTeamId: "team-1",
      mayAct: () => true,
    } as unknown as OnlineMatch);
    try {
      await render();
      const exit = [...container.querySelectorAll("button")].find((b) =>
        b.textContent?.includes("Continue to Main Menu")
      )!;
      await act(async () => exit.click());
      expect(clear).toHaveBeenCalledTimes(1);
    } finally {
      setActiveOnlineMatch(null);
      setMatchSaveRepository(null);
    }
  });

  it("lists injuries suffered by both teams, including players who never activated", async () => {
    const { team1, team2 } = setup(false);
    team1.players[0].status = PlayerStatus.INJURED;
    team1.players[0].injuries = [InjuryType.BADLY_HURT];
    team1.players[1].status = PlayerStatus.INJURED;
    team1.players[1].injuries = [InjuryType.MISS_NEXT_GAME];
    team2.players[0].status = PlayerStatus.DEAD;
    team2.players[0].injuries = [InjuryType.DEAD];
    await render();
    const injuries = container.querySelector(
      '[data-testid="match-injuries-team-1"]'
    );
    expect(injuries?.textContent).toContain(
      `${team1.players[0].playerName} #1: Badly hurt`
    );
    expect(injuries?.textContent).toContain(
      `${team1.players[1].playerName} #2: Seriously hurt`
    );
    expect(
      container.querySelector('[data-testid="match-injuries-team-2"]')
        ?.textContent
    ).toContain(`${team2.players[0].playerName} #1: Dead`);
  });

  it.each(["dodge", "crowd"])(
    "shows a casualty from a %s in injuries suffered",
    async (cause) => {
      const { services, team1 } = setup(false);
      const player = team1.players[0];
      player.skills = [];
      player.stats.AV = 2;
      vi.spyOn(
        services.gameService.getDiceController(),
        "roll2D6"
      ).mockReturnValue(10);
      const flow = new GameFlowManager({
        gameService: services.gameService,
        eventBus: services.eventBus,
        delay: noDelay,
      });
      flow.add(
        cause === "dodge"
          ? new ArmourOperation(player.id, undefined, {
              cause: "dodge",
              vacatedSquare: { x: 9, y: 5 },
            })
          : new CrowdInjuryOperation(player.id, { x: 0, y: 5 }, false)
      );
      await flow.whenIdle();
      await render();
      expect(
        container.querySelector('[data-testid="match-injuries-team-1"]')
          ?.textContent
      ).toContain(`${player.playerName} #1: Badly hurt`);
    }
  );

  it("holds the exit until MVP/SPP is confirmed for a progression-eligible match", async () => {
    const { services, state, team1, team2 } = setup(true);
    state.score["team-1"] = 1;
    state.score["team-2"] = 0;
    // One participant per team so the default MVP nomination is already
    // complete (no selection clicks required to enable the roll button).
    services.eventBus.emit(GameEventNames.PlayerActivated, team1.players[0].id);
    services.eventBus.emit(GameEventNames.PlayerActivated, team2.players[0].id);

    await render();

    let exitButton = [...container.querySelectorAll("button")].find((b) =>
      b.textContent?.includes("Continue to Main Menu")
    )!;
    expect(exitButton.disabled).toBe(true);

    const rollButtons = [...container.querySelectorAll("button")].filter((b) =>
      b.textContent?.includes("Roll MVP D6")
    );
    expect(rollButtons).toHaveLength(2);
    for (const button of rollButtons) {
      await act(async () => {
        button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
    }

    const confirmButton = [...container.querySelectorAll("button")].find((b) =>
      b.textContent?.includes("Confirm and assign SPP")
    )!;
    expect(confirmButton.disabled).toBe(false);
    await act(async () => {
      confirmButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    exitButton = [...container.querySelectorAll("button")].find((b) =>
      b.textContent?.includes("Continue to Main Menu")
    )!;
    expect(exitButton.disabled).toBe(false);
  });

  /** A league of the two teams, stored with them, as the coach left it at kick-off. */
  async function leagueOf(teams: Team[]): Promise<LeagueDoc> {
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

  it.each([
    {
      result: "a win",
      score: [1, 0],
      home: { wins: 1, draws: 0, losses: 0, touchdowns: 1 },
      away: { wins: 0, draws: 0, losses: 1, touchdowns: 0 },
    },
    {
      result: "a draw",
      score: [1, 1],
      home: { wins: 0, draws: 1, losses: 0, touchdowns: 1 },
      away: { wins: 0, draws: 1, losses: 0, touchdowns: 1 },
    },
  ])(
    "keeps $result recorded at full time when SPP is confirmed",
    async ({ score, home, away }) => {
      localStorage.clear();
      const { services, state, team1, team2 } = setup(true);
      const league = await leagueOf([team1, team2]);
      state.score["team-1"] = score[0];
      state.score["team-2"] = score[1];
      services.eventBus.emit(
        GameEventNames.PlayerActivated,
        team1.players[0].id
      );
      services.eventBus.emit(
        GameEventNames.PlayerActivated,
        team2.players[0].id
      );
      // GamePage records the fixture at full time; it is the season's last
      const fixture = league.fixtures[0];
      await recordCompetitionFixture(
        {
          competitionType: "league",
          competitionId: league.id,
          fixtureId: fixture.id,
        },
        score[0],
        score[1],
        { home: team1, away: team2 }
      );

      await render();
      for (const button of [...container.querySelectorAll("button")].filter(
        (b) => b.textContent?.includes("Roll MVP D6")
      )) {
        await act(async () => button.click());
      }
      const confirm = [...container.querySelectorAll("button")].find((b) =>
        b.textContent?.includes("Confirm and assign SPP")
      )!;
      await act(async () => confirm.click());

      const stored = (id: string) =>
        loadTeams().find((team) => team.id === id)!;
      const key = `${league.id}:${fixture.id}`;
      expect(stored("team-1")).toMatchObject({
        ...home,
        recordedFixtureIds: [key],
      });
      expect(stored("team-2")).toMatchObject({
        ...away,
        recordedFixtureIds: [key],
      });
      // The season is over, so both teams are free to enter the next one
      expect(stored("team-1").activeCompetitionId).toBeUndefined();
      expect(stored("team-2").activeCompetitionId).toBeUndefined();
      // And the MVP's SPP is kept as well
      expect(stored("team-1").players[0].spp).toBeGreaterThan(0);
    }
  );

  it("names the winner of a knockout tie decided on Penalties", async () => {
    const { state } = setup(false);
    state.score["team-1"] = 1;
    state.score["team-2"] = 1;
    state.result = {
      reason: "completed",
      penalties: { "team-1": 2, "team-2": 3 },
    };

    await render();

    expect(container.textContent).toContain("1 : 1");
    expect(container.textContent).toContain(
      "Bad Badgers win on Penalties, 3–2"
    );
    expect(container.textContent).not.toContain("Draw");
  });

  it("labels a concession without inventing a touchdown or mutating the played score (regression: 0-0 stays 0-0)", async () => {
    const { state, team1 } = setup(false);
    state.score["team-1"] = 0;
    state.score["team-2"] = 0;
    state.result = { reason: "concession", concedingTeamId: team1.id };

    await render();

    expect(container.textContent).toContain("0 : 0");
    expect(container.textContent).toContain("Reikland Reavers conceded");
    expect(container.textContent).not.toContain("win");
    expect(container.textContent).not.toContain("Draw");
  });
});
