/**
 * Computer teams in leagues and cups: built legal, entered like any team,
 * and a game between two of them is a whole simulated match whose result,
 * injuries and SPP are recorded the way a played game's are.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/firebase/config", () => ({
  isFirebaseConfigured: vi.fn(() => false),
  getDb: vi.fn(),
}));

import { createCompetition } from "../../src/competition/create";
import {
  createComputerTeam,
  manageComputerTeam,
} from "../../src/competition/computerTeams";
import { getCompetition } from "../../src/competition/repository";
import {
  checkTeamCompatibility,
  createRosterRuleProfile,
} from "../../src/competition/rosterRules";
import {
  simulatableFixtures,
  simulateFixture,
} from "../../src/competition/simulateFixture";
import { CompetitionDoc } from "../../src/competition/types";
import { getTeamById, saveTeam } from "../../src/game/managers/TeamManager";
import { RNGService } from "../../src/services/rng/RNGService";
import { createReadyMadeTeam } from "../../src/simulation/lineups";
import { RosterName, Team, TeamAdvancementMode } from "../../src/types/Team";

const MODES: TeamAdvancementMode[] = [
  "advanced-league",
  "sevens-skill-selection",
  "matched-play",
];

function computerTeam(
  roster: RosterName,
  name: string,
  mode: TeamAdvancementMode = "advanced-league"
): Team {
  return createComputerTeam(roster, name, 0x335577, mode);
}

/** A person's team, as Team Builder leaves it. */
function coachTeam(name: string): Team {
  const team = createReadyMadeTeam(RosterName.HUMAN, name, 0xaa2222);
  team.advancementMode = "advanced-league";
  saveTeam(team);
  return team;
}

beforeEach(() => localStorage.clear());

describe("computer teams", () => {
  it.each(MODES)(
    "every roster builds a team a %s competition accepts",
    (mode) => {
      const profile = createRosterRuleProfile({ advancementMode: mode });
      const refused = Object.values(RosterName).flatMap((roster) => {
        const { reasons } = checkTeamCompatibility(
          computerTeam(roster, roster, mode),
          profile
        );
        return reasons.length > 0 ? [`${roster}: ${reasons.join(" ")}`] : [];
      });
      expect(refused).toEqual([]);
    }
  );

  it("are coached by the computer", () => {
    const team = computerTeam(RosterName.ORC, "Nuln Hammers");
    expect(team).toMatchObject({
      name: "Nuln Hammers",
      coachName: "Computer",
      computerCoached: true,
      advancementMode: "advanced-league",
    });
  });

  it("spend SPP and hire back up to seven between games", () => {
    const team = computerTeam(RosterName.HUMAN, "Altdorf Avengers");
    team.players[0].spp = 6;
    team.players.splice(5);
    team.treasury = 200_000;
    const report = manageComputerTeam(team, new RNGService(7));
    expect(team.players).toHaveLength(7);
    expect(team.players[0].advancements).toHaveLength(1);
    expect(report.refused).toEqual([]);
    expect(report.done).toHaveLength(3);
  });
});

describe("creating a competition with computer teams", () => {
  it("enters them as computer entrants and keeps them in the library", async () => {
    const mine = coachTeam("My Team");
    const rivals = [RosterName.ORC, RosterName.SKAVEN, RosterName.DWARF].map(
      (roster) => computerTeam(roster, `${roster} XI`)
    );
    const league = await createCompetition({
      type: "league",
      name: "Season 1",
      organizerUid: null,
      entrants: [mine, ...rivals].map((team) => ({ team, ownerUid: null })),
    });

    expect(
      league.entrants.map(({ name, computerCoached, coachName }) => ({
        name,
        computerCoached,
        coachName,
      }))
    ).toEqual([
      { name: "My Team", computerCoached: undefined, coachName: "" },
      { name: "Orc XI", computerCoached: true, coachName: "Computer" },
      { name: "Skaven XI", computerCoached: true, coachName: "Computer" },
      { name: "Dwarf XI", computerCoached: true, coachName: "Computer" },
    ]);
    expect(league.computerDifficulty).toBe("standard");
    for (const team of rivals)
      expect(getTeamById(team.id)).toMatchObject({
        computerCoached: true,
        activeCompetitionId: league.id,
      });
    // Three of six games are between two computer teams
    expect(simulatableFixtures(league)).toHaveLength(3);
  });

  it("refuses a computer team already playing elsewhere", async () => {
    const busy = computerTeam(RosterName.ORC, "Busy Orcs");
    busy.activeCompetitionId = "league-elsewhere";
    await expect(
      createCompetition({
        type: "league",
        name: "Season 2",
        organizerUid: null,
        entrants: [
          { team: busy, ownerUid: null },
          {
            team: computerTeam(RosterName.ELVEN_UNION, "Elves"),
            ownerUid: null,
          },
        ],
      })
    ).rejects.toThrow(
      "Busy Orcs is already entered in another active competition."
    );
  });
});

describe("simulating a game between two computer teams", () => {
  it("records a played result and carries what happened onto both teams", async () => {
    const [orcs, dwarfs] = [
      computerTeam(RosterName.ORC, "Orcs"),
      computerTeam(RosterName.DWARF, "Dwarfs"),
    ];
    const league = await createCompetition({
      type: "league",
      name: "Season 1",
      organizerUid: null,
      entrants: [orcs, dwarfs].map((team) => ({ team, ownerUid: null })),
    });
    const [fixture] = simulatableFixtures(league);
    const outcome = await simulateFixture(league, fixture.id, { seed: 11 });

    const result = outcome.fixture.result!;
    expect(outcome.recording.findings).toEqual([]);
    expect(outcome.fixture.status).toBe("complete");
    const stored = (await getCompetition("league", league.id))!;
    expect(stored.status).toBe("complete");
    expect(stored.fixtures[0].result).toEqual(result);

    const home = getTeamById(stored.entrants[0].teamId)!;
    const away = getTeamById(stored.entrants[1].teamId)!;
    expect([home.touchdowns, away.touchdowns]).toEqual([
      result.homeScore,
      result.awayScore,
    ]);
    const lead = Math.sign(result.homeScore - result.awayScore);
    expect([home.wins, home.draws, home.losses]).toEqual(
      lead > 0 ? [1, 0, 0] : lead < 0 ? [0, 0, 1] : [0, 1, 0]
    );
    for (const team of [home, away]) {
      expect(team.recordedFixtureIds).toEqual([`${league.id}:${fixture.id}`]);
      expect(team.firstMatchPlayedAt).toBeTypeOf("number");
      // The league is over, so both teams are free to enter another
      expect(team.activeCompetitionId).toBeUndefined();
      // The computer made every development choice the match left
      expect(team.pendingDevelopment ?? []).toEqual([]);
    }
    // Every SPP earned was kept or spent on an advancement
    const earned = Object.values(outcome.sppEarned).reduce((a, b) => a + b, 0);
    expect(earned).toBeGreaterThan(0);
    const advanced = [home, away]
      .flatMap((team) => team.players)
      .filter((player) => (player.advancements?.length ?? 0) > 0);
    const kept = [home, away]
      .flatMap((team) => team.players)
      .reduce((sum, player) => sum + (player.spp ?? 0), 0);
    expect(kept + advanced.length).toBeGreaterThan(0);
  }, 60_000);

  it("refuses a game a person plays", async () => {
    const league = await createCompetition({
      type: "league",
      name: "Season 1",
      organizerUid: null,
      entrants: [
        { team: coachTeam("Mine"), ownerUid: null },
        { team: computerTeam(RosterName.ORC, "Orcs"), ownerUid: null },
      ],
    });
    await expect(
      simulateFixture(league, league.fixtures[0].id)
    ).rejects.toThrow(
      "Only a ready game between two computer teams is simulated."
    );
  });

  it("plays a whole computer cup through to its champion", async () => {
    const cupTeams = [
      RosterName.ORC,
      RosterName.HUMAN,
      RosterName.SKAVEN,
      RosterName.DWARF,
    ].map((roster) => computerTeam(roster, roster));
    let cup: CompetitionDoc = await createCompetition({
      type: "tournament",
      format: "single-elimination",
      name: "The Cup",
      organizerUid: null,
      entrants: cupTeams.map((team) => ({ team, ownerUid: null })),
    });
    let seed = 1;
    for (let next = simulatableFixtures(cup)[0]; next; ) {
      cup = (await simulateFixture(cup, next.id, { seed: seed++ })).competition;
      next = simulatableFixtures(cup)[0];
    }

    expect(seed - 1).toBe(3);
    expect(cup.status).toBe("complete");
    expect(cup.type === "tournament" && cup.championEntrantId).toBe(
      cup.fixtures.find((fixture) => fixture.round === 2)?.result
        ?.winnerEntrantId
    );
    for (const team of cupTeams)
      expect(getTeamById(team.id)?.activeCompetitionId).toBeUndefined();
  }, 120_000);
});
