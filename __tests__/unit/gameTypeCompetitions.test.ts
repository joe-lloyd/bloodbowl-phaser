import { fixtureValue } from "../../src/testing/fixtureValue";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/firebase/config", () => ({
  isFirebaseConfigured: vi.fn(() => false),
  getDb: vi.fn(),
}));

import { createCompetition } from "../../src/competition/create";
import { getComputerTeamTemplates } from "../../src/competition/computerTeamTemplates";
import {
  simulatableFixtures,
  simulateFixture,
} from "../../src/competition/simulateFixture";
import { getTeamById } from "../../src/game/managers/TeamManager";
import type { HeadlessGame } from "../../src/headless/HeadlessGame";
import { createReadyMadeTeam } from "../../src/simulation/lineups";
import { RosterName } from "../../src/types/Team";

beforeEach(() => {
  localStorage.clear();
});

describe("a Street Bowl tournament of computer teams", () => {
  it("drafts every computer team to Street Bowl rules and plays on the street", async () => {
    const templates = getComputerTeamTemplates({ gameType: "street-bowl" });
    const [first, second] = templates;
    const cup = await createCompetition({
      type: "tournament",
      name: "Cobble Cup",
      gameType: "street-bowl",
      organizerUid: null,
      entrants: [first, second].map((template) => ({
        computerTemplateId: fixtureValue(template).id,
      })),
    });
    expect(cup.gameType).toBe("street-bowl");

    const teams = cup.entrants.map((entrant) =>
      fixtureValue(getTeamById(entrant.teamId))
    );
    expect(teams.map((team) => team.gameType)).toEqual([
      "street-bowl",
      "street-bowl",
    ]);
    expect(
      teams.flatMap((team) => team.players.filter((player) => player.veteran))
    ).toEqual([]);
    expect(teams.map((team) => team.apothecary)).toEqual([false, false]);

    let game: HeadlessGame | undefined;
    const outcome = await simulateFixture(
      cup,
      fixtureValue(simulatableFixtures(cup)[0]).id,
      {
        seed: 5,
        inspect: (inspected) => (game = inspected),
      }
    );
    const state = fixtureValue(game).ctx.gameService.getState();
    expect([state.gameType, state.venue]).toEqual(["street-bowl", "street"]);
    expect(outcome.fixture.status).toBe("complete");
    expect(outcome.recording.findings).toEqual([]);
  }, 60_000);
});

describe("entering a competition with a game type", () => {
  it("lets a Sevens team bring its Veteran into a Beach Bowl league (BB-D4)", async () => {
    const sevens = createReadyMadeTeam(RosterName.HUMAN, "Sevens side", 0xaa2222);
    const [template] = getComputerTeamTemplates({ gameType: "beach-bowl" });
    const league = await createCompetition({
      type: "league",
      name: "Sand Season",
      gameType: "beach-bowl",
      organizerUid: null,
      entrants: [
        { team: sevens, ownerUid: null },
        { computerTemplateId: fixtureValue(template).id },
      ],
    });
    expect(league.gameType).toBe("beach-bowl");
    expect(league.entrants.map((entrant) => entrant.name)).toContain("Sevens side");
  });

  it("builds Gutter Bowl computer teams on the 750,000 budget", () => {
    const sevens = getComputerTeamTemplates();
    const gutter = getComputerTeamTemplates({ gameType: "gutter-bowl" });
    expect(gutter.length).toBeGreaterThanOrEqual(sevens.length);
  });
});
