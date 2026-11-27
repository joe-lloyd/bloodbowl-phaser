import { fixtureValue } from "../../src/testing/fixtureValue";
import { describe, expect, it } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { type Scenario } from "../../src/types/Scenario";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { SkillType } from "../../src/types/Skills";

const scenario = (mateSkills: SkillType[]): Scenario => ({
  id: "ttm-legal",
  name: "Throw Team-mate legal",
  description: "",
  setup: {
    team1Placements: [
      { playerIndex: 0, x: 4, y: 5, skills: [SkillType.THROW_TEAM_MATE] },
      { playerIndex: 1, x: 5, y: 5, skills: mateSkills },
    ],
    team2Placements: [{ playerIndex: 0, x: 16, y: 9 }],
    activeTeam: "team1",
    phase: GamePhase.PLAY,
    subPhase: SubPhase.TURN_RECEIVING,
  },
});

async function legalFor(mateSkills: SkillType[]) {
  const game = new HeadlessGame({ scenario: scenario(mateSkills), seed: 1 });
  const response = await game.execute({ type: "legal-actions" });
  const thrower = game.ctx.teams[0].players[0];
  return response.legalActions?.players.find(
    (p) => p.playerId === fixtureValue(thrower).id
  )?.actions;
}

describe("legal actions", () => {
  it("include Throw Team-mate beside a Right Stuff team-mate", async () => {
    expect(await legalFor([SkillType.RIGHT_STUFF])).toContain("throwTeamMate");
  });

  it("leave it out with nobody to throw", async () => {
    expect(await legalFor([])).not.toContain("throwTeamMate");
  });

  it("leave it out once the team has thrown a team-mate this turn", async () => {
    const game = new HeadlessGame({
      scenario: scenario([SkillType.RIGHT_STUFF]),
      seed: 1,
    });
    game.ctx.gameService.getState().turn.hasThrownTeamMate = true;
    const response = await game.execute({ type: "legal-actions" });
    const thrower = game.ctx.teams[0].players[0];
    expect(
      response.legalActions?.players.find(
        (p) => p.playerId === fixtureValue(thrower).id
      )?.actions
    ).not.toContain("throwTeamMate");
  });

  it("include it for a Kick Team-mate player", async () => {
    const game = new HeadlessGame({
      scenario: {
        ...scenario([SkillType.RIGHT_STUFF]),
        setup: {
          ...scenario([SkillType.RIGHT_STUFF]).setup,
          team1Placements: [
            { playerIndex: 0, x: 4, y: 5, skills: [SkillType.KICK_TEAM_MATE] },
            { playerIndex: 1, x: 5, y: 5, skills: [SkillType.RIGHT_STUFF] },
          ],
        },
      },
      seed: 1,
    });
    const response = await game.execute({ type: "legal-actions" });
    const kicker = game.ctx.teams[0].players[0];
    expect(
      response.legalActions?.players.find(
        (p) => p.playerId === fixtureValue(kicker).id
      )?.actions
    ).toContain("throwTeamMate");
  });
});
